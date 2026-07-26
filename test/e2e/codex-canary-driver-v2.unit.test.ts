// SPEC-0002@v8 S6/S11/S14-S16 / R5-R6/R13/R17-R19 — Codex JSONL and pre-sink safety.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildCodexExecArgs,
  classifyCanary,
  commandEnvironments,
  createOutputCollector,
  dashboardHealth,
  execProvesPreToolAbsence,
  installOutcomeFailed,
  normalizeTranscript,
  runCommand,
  validateCanaryEvidence,
  validCanonicalStatus,
  workflowContext,
} from "../../scripts/codex-canary.mjs";

const nonce = "wisp-canary-test-nonce";
const exactOutputLimit = 4 * 1024 * 1024;

async function retainedStdioRun(
  trigger: "deadline" | "overflow" | "callback",
) {
  const root = await mkdtemp(join(tmpdir(), "wisp-canary-retained-stdio-"));
  const pidPath = join(root, "descendant.pid");
  const triggerSource = trigger === "overflow"
    ? 'process.stdout.write("x".repeat(11));'
    : trigger === "callback"
      ? 'process.stdout.write("line\\n");'
      : "";
  const script = [
    'const{spawn}=require("node:child_process");',
    'const{writeFileSync}=require("node:fs");',
    "const child=spawn(process.execPath,",
    '["-e","setTimeout(()=>{},3000)"],',
    "{detached:true,stdio:['ignore',process.stdout,process.stderr]});",
    "writeFileSync(process.argv[1],String(child.pid));",
    triggerSource,
    "setInterval(()=>{},1000);",
  ].join("");
  const started = Date.now();
  try {
    const result = await runCommand(
      process.execPath,
      ["-e", script, pidPath],
      {
        timeoutMs: trigger === "deadline" ? 60 : 10_000,
        killGraceMs: 40,
        maxOutputBytes: trigger === "overflow" ? 10 : exactOutputLimit,
        ...(trigger === "callback"
          ? {
            onStdoutLine: () =>
              Promise.reject(new Error("callback rejected")),
          }
          : {}),
      },
    );
    return { result, elapsed: Date.now() - started };
  } finally {
    const descendantPid = Number(
      await readFile(pidPath, "utf8").catch(() => "0"),
    );
    if (descendantPid > 0) {
      try {
        process.kill(-descendantPid, "SIGKILL");
      } catch {
        try {
          process.kill(descendantPid, "SIGKILL");
        } catch {
          // The bounded descendant may already have exited.
        }
      }
    }
    await rm(root, { recursive: true, force: true });
  }
}

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

describe("SPEC-0002@v8 real Codex Preview-smoke normalization", () => {
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
      mode: "manual",
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

  it("cancels the grace kill after a terminating child closes", async () => {
    if (process.platform === "win32") return;
    const kill = vi.spyOn(process, "kill");
    try {
      const result = await runCommand(
        process.execPath,
        [
          "-e",
          "process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},1000)",
        ],
        { timeoutMs: 40, killGraceMs: 200 },
      );
      expect(result.timedOut).toBe(true);
      expect(
        kill.mock.calls.filter((call) => call[1] === "SIGTERM"),
      ).toHaveLength(1);

      await new Promise((resolveWait) => setTimeout(resolveWait, 300));

      expect(
        kill.mock.calls.filter((call) => call[1] === "SIGKILL"),
      ).toHaveLength(0);
    } finally {
      kill.mockRestore();
    }
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

  it("keeps raw subprocess output off stdout and stderr sinks", async () => {
    const capability = "A".repeat(43);
    const stdout = vi.spyOn(process.stdout, "write");
    const stderr = vi.spyOn(process.stderr, "write");
    try {
      const captured = await runCommand(
        process.execPath,
        [
          "-e",
          `process.stdout.write("#capability=${capability}");process.stderr.write("Bearer ${capability}")`,
        ],
      );
      expect(captured.stdout.toString()).toBe(`#capability=${capability}`);
      expect(captured.stderr.toString()).toBe(`Bearer ${capability}`);
      expect(stdout).not.toHaveBeenCalled();
      expect(stderr).not.toHaveBeenCalled();
    } finally {
      stdout.mockRestore();
      stderr.mockRestore();
    }
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

  it("fails a bounded-output overflow without waiting for the command deadline", async () => {
    const started = Date.now();
    const overflow = await runCommand(
      process.execPath,
      ["-e", 'process.stdout.write("x".repeat(1024));setInterval(()=>{},1000)'],
      { timeoutMs: 10_000, maxOutputBytes: 10 },
    );
    expect(overflow.outputExceeded).toBe(true);
    expect(overflow.status).not.toBe(0);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it.each(["deadline", "overflow", "callback"] as const)(
    "settles %s termination within its grace bound when a detached descendant retains stdio",
    async (trigger) => {
      if (process.platform === "win32") return;
      const { result, elapsed } = await retainedStdioRun(trigger);
      expect(elapsed).toBeLessThan(1_000);
      expect(result.status).not.toBe(0);
      expect(result.timedOut).toBe(trigger === "deadline");
      expect(result.outputExceeded).toBe(trigger === "overflow");
      expect(result.callbackFailed).toBe(trigger === "callback");
    },
    10_000,
  );

  it("accepts exactly 4,194,304 mixed stdout/stderr bytes and rejects the whole crossing chunk and all later output", () => {
    const aborted: string[] = [];
    const collector = createOutputCollector(
      exactOutputLimit,
      () => aborted.push("abort"),
    );
    const stdout = Buffer.alloc(2 * 1024 * 1024, 0x61);
    const stderr = Buffer.alloc(2 * 1024 * 1024, 0x62);
    expect(collector.accept("stdout", stdout)).toBe(true);
    expect(collector.accept("stderr", stderr)).toBe(true);
    expect(collector.accept("stdout", Buffer.from("x"))).toBe(false);
    expect(collector.accept("stderr", Buffer.from("later"))).toBe(false);
    const result = collector.result();
    expect(result.outputExceeded).toBe(true);
    expect(result.acceptedBytes).toBe(exactOutputLimit);
    expect(result.stdout.equals(stdout)).toBe(true);
    expect(result.stderr.equals(stderr)).toBe(true);
    expect(aborted).toEqual(["abort"]);
  });

  it.each(["synchronous throw", "rejection"] as const)(
    "turns a streamed callback %s into typed failure and aborts the child",
    async (failure) => {
      const secret = `Bearer ${"Z".repeat(43)}`;
      const stdout = vi.spyOn(process.stdout, "write");
      const stderr = vi.spyOn(process.stderr, "write");
      const unhandled = vi.fn();
      process.on("unhandledRejection", unhandled);
      try {
        const result = await runCommand(
          process.execPath,
          ["-e", "console.log('line');setInterval(()=>{},1000)"],
          {
            timeoutMs: 2_000,
            killGraceMs: 20,
            onStdoutLine: failure === "synchronous throw"
              ? () => {
                throw new Error(secret);
              }
              : () => Promise.reject(new Error(secret)),
          },
        );
        expect(result.callbackFailed).toBe(true);
        expect(result.status).not.toBe(0);
        expect(stdout).not.toHaveBeenCalled();
        expect(stderr).not.toHaveBeenCalled();
        expect(result.stderr.toString()).not.toContain(secret);
        await new Promise<void>((resolveImmediate) =>
          setImmediate(resolveImmediate)
        );
        expect(unhandled).not.toHaveBeenCalled();
      } finally {
        process.off("unhandledRejection", unhandled);
        stdout.mockRestore();
        stderr.mockRestore();
      }
    },
  );

  it("reduces every health exception path to false without emitting thrown values", async () => {
    const url =
      `http://127.0.0.1:43123/#capability=${"A".repeat(43)}`;
    const secret = `Bearer ${"Z".repeat(43)}`;
    const throwingStatus = {
      get status() {
        throw new Error(secret);
      },
    };
    const stdout = vi.spyOn(process.stdout, "write");
    const stderr = vi.spyOn(process.stderr, "write");
    try {
      for (const fetchImpl of [
        () => {
          throw new Error(secret);
        },
        () => Promise.reject(new Error(secret)),
        () => Promise.resolve(throwingStatus),
      ]) {
        await expect(dashboardHealth(
          url,
          undefined,
          fetchImpl as unknown as typeof fetch,
        )).resolves.toBe(false);
      }
      expect(stdout).not.toHaveBeenCalled();
      expect(stderr).not.toHaveBeenCalled();
    } finally {
      stdout.mockRestore();
      stderr.mockRestore();
    }
  });

  it("reduces the exact health timeout and parent abort to false", async () => {
    const url =
      `http://127.0.0.1:43123/#capability=${"A".repeat(43)}`;
    const secret = `Bearer ${"Z".repeat(43)}`;
    const pendingFetch = ((_input: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        const rejectAbort = () => reject(new Error(secret));
        if (signal?.aborted) rejectAbort();
        else signal?.addEventListener("abort", rejectAbort, { once: true });
      })) as unknown as typeof fetch;

    vi.useFakeTimers();
    try {
      const timedOut = dashboardHealth(url, undefined, pendingFetch);
      await vi.advanceTimersByTimeAsync(5_000);
      await expect(timedOut).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }

    const parent = new AbortController();
    const aborted = dashboardHealth(url, parent.signal, pendingFetch);
    parent.abort();
    await expect(aborted).resolves.toBe(false);
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

  it("validates the exact Preview-smoke evidence schema and pass invariants", () => {
    const evidence = {
      schema: 1,
      mode: "manual",
      result: "pass",
      started_at: "2026-07-26T00:00:00.000Z",
      finished_at: "2026-07-26T00:00:01.000Z",
      workflow_id: 123,
      workflow_run_url: "https://github.com/kodhama/wisp/actions/runs/123",
      git_sha: "a".repeat(40),
      marketplace_source: "kodhama/stewards",
      codex_version: "codex-cli 1.0.0",
      plugin_version: "0.2.1-rc.4",
      completed_tools: ["wisp_check", "wisp_status", "wisp_dashboard"],
      check_passed: true,
      write_passed: true,
      bus_path_verified: true,
      dashboard_call_passed: true,
      dashboard_health_passed: true,
      transcript_verified: true,
    };
    expect(validateCanaryEvidence(evidence)).toEqual(evidence);
    for (const invalid of [
      { ...evidence, unknown: true },
      { ...evidence, mode: "candidate" },
      { ...evidence, marketplace_source: " " },
      { ...evidence, finished_at: "2026-07-25T23:59:59.000Z" },
      { ...evidence, plugin_version: "01.0.0" },
      { ...evidence, completed_tools: ["wisp_status", "wisp_check", "wisp_dashboard"] },
      { ...evidence, dashboard_health_passed: false },
    ]) {
      expect(() => validateCanaryEvidence(invalid)).toThrow(
        "invalid canary evidence",
      );
    }
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
