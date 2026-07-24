// SPEC-0002 v5 (restored v2 behavior): S6 / R5-R6 — codex-cli 0.145.0 JSONL normalization and result precedence.
import { describe, expect, it } from "vitest";
import {
  buildCodexExecArgs,
  classifyCanary,
  commandEnvironments,
  execProvesPreToolAbsence,
  installOutcomeFailed,
  normalizeTranscript,
  runCommand,
  validCanonicalStatus,
  workflowContext,
} from "../../scripts/codex-canary.mjs";

const nonce = "wisp-canary-test-nonce";

function item(
  topType: "item.started" | "item.completed",
  id: string,
  tool: string,
  args: Record<string, unknown>,
  result: Record<string, unknown> | null,
  options: { status?: string; error?: unknown; server?: string } = {},
) {
  return {
    type: topType,
    item: {
      id,
      type: "mcp_tool_call",
      server: options.server ?? "wisp",
      tool,
      arguments: args,
      status: options.status ?? (topType === "item.completed" ? "completed" : "in_progress"),
      error: options.error ?? null,
      result,
    },
  };
}

function successLines() {
  const checkArgs = { run: nonce, agent: "codex-canary" };
  const statusArgs = {
    run: nonce,
    agent: "codex-canary",
    state: "working",
    activity: nonce,
  };
  return [
    { type: "thread.started", thread_id: "thread-1" },
    { type: "turn.started" },
    item("item.started", "check", "wisp_check", checkArgs, null),
    item("item.completed", "check", "wisp_check", checkArgs, {
      structured_content: { ok: true, data: { commands: [], parse_errors: [] } },
    }),
    item("item.started", "status", "wisp_status", statusArgs, null),
    item("item.completed", "status", "wisp_status", statusArgs, {
      structured_content: { ok: true, data: { event: {} } },
    }),
    item("item.started", "dashboard", "wisp_dashboard", {}, null),
    item("item.completed", "dashboard", "wisp_dashboard", {}, {
      structured_content: {
        ok: true,
        data: {
          url: "http://127.0.0.1:43123/#capability=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        },
      },
    }),
    { type: "turn.completed" },
  ];
}

describe("SPEC-0002 v5 real Codex canary normalization", () => {
  it("normalizes only exact top-level successful Wisp calls and proves each boolean independently", () => {
    const normalized = normalizeTranscript(successLines(), {
      nonce,
      execStatus: 0,
      everyLineParsed: true,
    });
    expect(normalized).toMatchObject({
      wisp_call_seen: true,
      incomplete_wisp_call: false,
      completed_tools: ["wisp_check", "wisp_status", "wisp_dashboard"],
      check_passed: true,
      write_passed: true,
      dashboard_call_passed: true,
      transcript_verified: true,
      dashboard_url: "http://127.0.0.1:43123/#capability=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    });
  });

  it("does not mistake prose, nested lookalikes, started calls, or other servers for completion", () => {
    const records = [
      { type: "thread.started", thread_id: "thread-1" },
      { type: "turn.started" },
      { type: "agent_message", text: "I called wisp_check successfully" },
      { type: "item.completed", nested: item("item.completed", "nested", "wisp_check", {}, {}) },
      item("item.started", "started", "wisp_check", { run: nonce, agent: "codex-canary" }, null),
      item("item.completed", "other", "wisp_check", { run: nonce, agent: "codex-canary" }, {
        structured_content: { ok: true },
      }, { server: "other" }),
      { type: "turn.completed" },
    ];
    const normalized = normalizeTranscript(records, {
      nonce,
      execStatus: 0,
      everyLineParsed: true,
    });
    expect(normalized.completed_tools).toEqual([]);
    expect(normalized.check_passed).toBe(false);
    expect(normalized.incomplete_wisp_call).toBe(true);
  });

  it("classifies approval failure as fail after a Wisp item, but pre-tool weekly external absence as inconclusive", () => {
    const approvalFailure = normalizeTranscript([
      { type: "thread.started", thread_id: "thread-1" },
      { type: "turn.started" },
      item("item.started", "check", "wisp_check", { run: nonce, agent: "codex-canary" }, null),
      item("item.completed", "check", "wisp_check", { run: nonce, agent: "codex-canary" }, null, {
        status: "failed",
        error: "approval denied",
      }),
      { type: "turn.failed", error: "approval denied" },
    ], { nonce, execStatus: 1, everyLineParsed: true });
    expect(classifyCanary({
      mode: "weekly",
      normalized: approvalFailure,
      busPathVerified: false,
      dashboardHealthPassed: false,
      provenPreToolAbsence: true,
    })).toBe("fail");

    const noCalls = normalizeTranscript([], {
      nonce,
      execStatus: 1,
      everyLineParsed: true,
    });
    expect(classifyCanary({
      mode: "weekly",
      normalized: noCalls,
      busPathVerified: false,
      dashboardHealthPassed: false,
      provenPreToolAbsence: true,
    })).toBe("inconclusive");
    expect(classifyCanary({
      mode: "candidate",
      normalized: noCalls,
      busPathVerified: false,
      dashboardHealthPassed: false,
      provenPreToolAbsence: true,
    })).toBe("fail");

    expect(execProvesPreToolAbsence({
      status: 1,
      spawnError: undefined,
      stderr: Buffer.from("Authentication service unavailable"),
    })).toBe(true);
    expect(execProvesPreToolAbsence({
      status: 1,
      spawnError: undefined,
      stderr: Buffer.from("model ignored the prompt"),
    })).toBe(false);
    expect(execProvesPreToolAbsence({
      status: 0,
      spawnError: undefined,
      stderr: Buffer.from("authentication unavailable"),
    })).toBe(false);
    expect(execProvesPreToolAbsence({
      status: null,
      timedOut: true,
      spawnError: undefined,
      stderr: Buffer.alloc(0),
    })).toBe(false);
  });

  it("requires exact call order and transcript lifecycle, including zero exec status", () => {
    const records = successLines();
    const reordered = [
      ...records.slice(0, 2),
      ...records.slice(4, 6),
      ...records.slice(2, 4),
      ...records.slice(6),
    ];
    expect(normalizeTranscript(reordered, {
      nonce,
      execStatus: 0,
      everyLineParsed: true,
    }).completed_tools).toEqual(["wisp_status", "wisp_check", "wisp_dashboard"]);
    expect(normalizeTranscript(successLines(), {
      nonce,
      execStatus: 1,
      everyLineParsed: true,
    }).transcript_verified).toBe(false);
    expect(normalizeTranscript(successLines(), {
      nonce,
      execStatus: 0,
      execTimedOut: true,
      everyLineParsed: true,
    }).transcript_verified).toBe(false);
    expect(normalizeTranscript([
      ...successLines().slice(0, -1),
      { type: "turn.failed" },
    ], {
      nonce,
      execStatus: 0,
      everyLineParsed: true,
    }).transcript_verified).toBe(false);
  });

  it("passes risk-reviewed config and terminates subprocesses at a deadline", async () => {
    const args = buildCodexExecArgs("/tmp/project", "prompt");
    expect(args).toContain('approval_policy="on-request"');
    expect(args).toContain('approvals_reviewer="auto_review"');
    expect(args.join(" ")).not.toMatch(/dangerously-bypass/u);

    let observedLive = false;
    const streamed = await runCommand(
      process.execPath,
      ["-e", "console.log('line'); setTimeout(() => {}, 100)"],
      {
        timeoutMs: 1_000,
        onStdoutLine: (_line, state) => {
          observedLive = state.childIsLive();
        },
      },
    );
    expect(streamed.status).toBe(0);
    expect(observedLive).toBe(true);

    const result = await runCommand(
      process.execPath,
      ["-e", "setInterval(() => {}, 1000)"],
      { timeoutMs: 30, killGraceMs: 30 },
    );
    expect(result.timedOut).toBe(true);
    expect(result.status).not.toBe(0);
  });

  it("bounds a stalled callback and kills the complete POSIX process group", async () => {
    const started = Date.now();
    const stalled = await runCommand(
      process.execPath,
      ["-e", "console.log('line')"],
      {
        timeoutMs: 40,
        killGraceMs: 20,
        onStdoutLine: () => new Promise(() => undefined),
      },
    );
    expect(stalled.timedOut).toBe(true);
    expect(Date.now() - started).toBeLessThan(1_000);

    if (process.platform === "win32") return;
    let descendantPid = 0;
    const grouped = await runCommand(
      process.execPath,
      [
        "-e",
        "const{spawn}=require('node:child_process');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});console.log(c.pid);setInterval(()=>{},1000)",
      ],
      {
        timeoutMs: 60,
        killGraceMs: 30,
        onStdoutLine: (line) => {
          descendantPid = Number(line);
        },
      },
    );
    expect(grouped.timedOut).toBe(true);
    expect(descendantPid).toBeGreaterThan(0);
    await expect.poll(() => {
      try {
        process.kill(descendantPid, 0);
        return true;
      } catch {
        return false;
      }
    }).toBe(false);
  });

  it("requires real workflow provenance and honors the Codex installation outcome", () => {
    expect(workflowContext({
      GITHUB_RUN_ID: "123",
      GITHUB_REPOSITORY: "kodhama/wisp",
      GITHUB_SHA: "a".repeat(40),
    })).toEqual({
      workflow_id: 123,
      workflow_run_url: "https://github.com/kodhama/wisp/actions/runs/123",
      git_sha: "a".repeat(40),
    });
    for (const env of [
      {},
      {
        GITHUB_RUN_ID: "0",
        GITHUB_REPOSITORY: "kodhama/wisp",
        GITHUB_SHA: "a".repeat(40),
      },
      {
        GITHUB_RUN_ID: "123",
        GITHUB_REPOSITORY: "invalid",
        GITHUB_SHA: "a".repeat(40),
      },
      {
        GITHUB_RUN_ID: "123",
        GITHUB_REPOSITORY: "kodhama/wisp",
        GITHUB_SHA: "not-a-sha",
      },
    ]) {
      expect(() => workflowContext(env)).toThrow("invalid GitHub workflow context");
    }
    expect(installOutcomeFailed(undefined)).toBe(false);
    expect(installOutcomeFailed("success")).toBe(false);
    expect(installOutcomeFailed("failure")).toBe(true);
    expect(() => installOutcomeFailed("skipped")).toThrow("invalid Codex install outcome");
  });

  it("exposes the release secret only to codex exec children", () => {
    const environments = commandEnvironments({
      PATH: "/bin",
      CANARY_CODEX_API_KEY: "release-secret",
      OPENAI_API_KEY: "must-not-leak",
    });
    expect(environments.baseEnv).toEqual({ PATH: "/bin" });
    expect(environments.execEnv).toEqual({
      PATH: "/bin",
      CODEX_API_KEY: "release-secret",
    });
    expect(() => commandEnvironments({
      CANARY_CODEX_API_KEY: "one",
      CODEX_API_KEY: "two",
    })).toThrow("conflicting Codex API keys");
  });

  it("accepts only round-trippable canonical bus timestamps", () => {
    const event = {
      v: 1,
      ts: "2026-07-24T12:00:00.000Z",
      run: nonce,
      agent: "codex-canary",
      kind: "status",
      state: "working",
      activity: nonce,
    };
    expect(validCanonicalStatus(JSON.stringify(event), nonce)).toBe(true);
    expect(validCanonicalStatus(JSON.stringify({
      ...event,
      ts: "2026-02-30T12:00:00.000Z",
    }), nonce)).toBe(false);
  });
});
