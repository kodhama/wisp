#!/usr/bin/env node
// SPEC-0002 v2: S6 / R5-R6.
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { StringDecoder } from "node:string_decoder";

const REPRESENTATIVE_TOOLS = ["wisp_check", "wisp_status", "wisp_dashboard"];
const EXTERNAL_ABSENCE =
  /auth(?:entication|orization)?|credential|marketplace|network|service|rate.?limit|timed? out|unavailable|not found|ENOTFOUND|ECONN/iu;
const DASHBOARD_URL =
  /^http:\/\/127\.0\.0\.1:([1-9]\d{0,4})\/#capability=([A-Za-z0-9_-]{43})$/u;
const SEMVER =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const ISO_MILLISECONDS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const COMMAND_TIMEOUT_MS = 120_000;
const VERSION_TIMEOUT_MS = 30_000;
const EXEC_TIMEOUT_MS = 300_000;
const KILL_GRACE_MS = 2_000;
const DASHBOARD_HEALTH_TIMEOUT_MS = 5_000;

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected) {
  return record(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function parseArguments(argv) {
  const allowed = new Set([
    "--mode",
    "--marketplace-source",
    "--marketplace-ref",
    "--version",
    "--sha256",
    "--output",
  ]);
  if (argv.length % 2 !== 0) throw new Error("invalid arguments");
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(key) || key.slice(2) in values || !value) {
      throw new Error("invalid arguments");
    }
    values[key.slice(2)] = value;
  }
  if (!["weekly", "candidate"].includes(values.mode) ||
    !values["marketplace-source"] || !values["marketplace-ref"] ||
    !values.output || !isAbsolute(values.output)) {
    throw new Error("invalid arguments");
  }
  if (values.mode === "candidate" &&
    (!SEMVER.test(values.version ?? "") || !/^[0-9a-f]{64}$/u.test(values.sha256 ?? ""))) {
    throw new Error("invalid candidate identity");
  }
  if (values.mode === "weekly" && (values.version || values.sha256)) {
    throw new Error("weekly identity is resolved from the install");
  }
  return values;
}

export async function runCommand(command, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? COMMAND_TIMEOUT_MS;
  const killGraceMs = options.killGraceMs ?? KILL_GRACE_MS;
  return new Promise((resolveRun) => {
    let finishing = false;
    let resolved = false;
    let timedOut = false;
    let spawnError;
    let pendingLine = "";
    let callbacks = Promise.resolve();
    const stdout = [];
    const stderr = [];
    const decoder = new StringDecoder("utf8");
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      detached: process.platform !== "win32",
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const callbackAbort = new AbortController();
    const callbackState = {
      childIsLive: () =>
        child.exitCode === null && child.signalCode === null,
      signal: callbackAbort.signal,
    };
    const terminate = (signal) => {
      if (process.platform !== "win32" && child.pid !== undefined) {
        try {
          process.kill(-child.pid, signal);
          return;
        } catch (error) {
          if (error?.code === "ESRCH") return;
        }
      }
      try {
        child.kill(signal);
      } catch {
        // The process may have exited between the liveness check and signal.
      }
    };
    let resolveDeadline;
    const deadlineReached = new Promise((resolve) => {
      resolveDeadline = resolve;
    });
    let resolveTermination;
    const terminationFinished = new Promise((resolve) => {
      resolveTermination = resolve;
    });
    let killTimer;
    const deadline = setTimeout(() => {
      timedOut = true;
      callbackAbort.abort();
      terminate("SIGTERM");
      resolveDeadline();
      killTimer = setTimeout(() => {
        terminate("SIGKILL");
        resolveTermination();
      }, killGraceMs);
      void finish(child.exitCode, child.signalCode);
    }, timeoutMs);
    const queueCallback = (line) => {
      callbacks = callbacks
        .catch(() => undefined)
        .then(() => options.onStdoutLine(line, callbackState));
    };
    const finish = async (status, signal) => {
      if (finishing || resolved) return;
      finishing = true;
      if (pendingLine !== "" && options.onStdoutLine) {
        queueCallback(pendingLine);
      }
      const callbackResult = callbacks
        .then(() => "callbacks")
        .catch(() => "callbacks");
      const winner = await Promise.race([
        callbackResult,
        deadlineReached.then(() => "deadline"),
      ]);
      if (winner === "callbacks" && !timedOut) {
        clearTimeout(deadline);
        resolveTermination();
      } else {
        await terminationFinished;
        void callbacks.catch(() => undefined);
      }
      if (killTimer !== undefined && !timedOut) clearTimeout(killTimer);
      resolved = true;
      resolveRun({
        status: child.exitCode ?? status,
        signal: child.signalCode ?? signal,
        timedOut,
        spawnError,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
      });
    };
    child.stdout.on("data", (chunk) => {
      const bytes = Buffer.from(chunk);
      stdout.push(bytes);
      if (!options.onStdoutLine) return;
      pendingLine += decoder.write(bytes);
      const lines = pendingLine.split("\n");
      pendingLine = lines.pop() ?? "";
      for (const line of lines) {
        queueCallback(line);
      }
    });
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.once("error", (error) => {
      spawnError = error;
      stderr.push(Buffer.from(error.message));
      void finish(null, null);
    });
    child.once("close", (status, signal) => {
      pendingLine += decoder.end();
      void finish(status, signal);
    });
  });
}

function exactWispItem(value) {
  if (!record(value) ||
    (value.type !== "item.started" && value.type !== "item.completed") ||
    !record(value.item) ||
    value.item.type !== "mcp_tool_call" ||
    value.item.server !== "wisp" ||
    typeof value.item.tool !== "string") {
    return undefined;
  }
  return { topType: value.type, item: value.item };
}

function successfulCompleted(call) {
  return call.topType === "item.completed" &&
    call.item.status === "completed" &&
    call.item.error === null &&
    record(call.item.result);
}

function structuredOk(item) {
  return record(item.result) &&
    record(item.result.structured_content) &&
    item.result.structured_content.ok === true;
}

function exactDashboardUrl(item) {
  if (!exactKeys(item.arguments, [])) return undefined;
  const structured = item.result?.structured_content;
  const url = structuredOk(item) && record(structured.data) &&
    typeof structured.data.url === "string" ? structured.data.url : undefined;
  if (url === undefined) return undefined;
  const match = DASHBOARD_URL.exec(url);
  if (!match) return undefined;
  const port = Number(match[1]);
  return port <= 65_535 ? url : undefined;
}

export function normalizeTranscript(values, options) {
  const calls = values.map(exactWispItem).filter((value) => value !== undefined);
  const successful = calls.filter(successfulCompleted);
  const completedTools = [];
  for (const call of successful) {
    if (REPRESENTATIVE_TOOLS.includes(call.item.tool) &&
      !completedTools.includes(call.item.tool)) {
      completedTools.push(call.item.tool);
    }
  }
  const successfulIds = new Set(successful.map((call) =>
    `${String(call.item.id)}\u0000${call.item.tool}`
  ));
  const incomplete = calls.some((call) => {
    if (call.topType === "item.completed") return !successfulCompleted(call);
    return !successfulIds.has(`${String(call.item.id)}\u0000${call.item.tool}`);
  });
  const checkPassed = successful.some(({ item }) =>
    item.tool === "wisp_check" &&
    exactKeys(item.arguments, ["run", "agent"]) &&
    item.arguments.run === options.nonce &&
    item.arguments.agent === "codex-canary" &&
    structuredOk(item)
  );
  const writePassed = successful.some(({ item }) =>
    item.tool === "wisp_status" &&
    exactKeys(item.arguments, ["run", "agent", "state", "activity"]) &&
    item.arguments.run === options.nonce &&
    item.arguments.agent === "codex-canary" &&
    item.arguments.state === "working" &&
    item.arguments.activity === options.nonce &&
    structuredOk(item)
  );
  let dashboardUrl;
  const dashboardCallPassed = successful.some(({ item }) => {
    if (item.tool !== "wisp_dashboard") return false;
    const url = exactDashboardUrl(item);
    if (url === undefined) return false;
    dashboardUrl ??= url;
    return true;
  });
  const types = values.map((value) => record(value) ? value.type : undefined);
  const threadIndex = types.indexOf("thread.started");
  const turnStartedIndex = types.indexOf("turn.started");
  const turnCompletedIndex = types.indexOf("turn.completed");
  const transcriptVerified = options.everyLineParsed === true &&
    options.execStatus === 0 &&
    options.execTimedOut !== true &&
    threadIndex >= 0 &&
    turnStartedIndex > threadIndex &&
    turnCompletedIndex > turnStartedIndex &&
    !types.includes("turn.failed") &&
    !types.includes("error");
  return {
    wisp_call_seen: calls.length > 0,
    incomplete_wisp_call: incomplete,
    completed_tools: completedTools,
    check_passed: checkPassed,
    write_passed: writePassed,
    dashboard_call_passed: dashboardCallPassed,
    dashboard_url: dashboardUrl,
    transcript_verified: transcriptVerified,
  };
}

export function classifyCanary({
  mode,
  normalized,
  busPathVerified,
  dashboardHealthPassed,
  provenPreToolAbsence,
}) {
  const pass = !normalized.incomplete_wisp_call &&
    JSON.stringify(normalized.completed_tools) === JSON.stringify(REPRESENTATIVE_TOOLS) &&
    normalized.check_passed &&
    normalized.write_passed &&
    busPathVerified &&
    normalized.dashboard_call_passed &&
    dashboardHealthPassed &&
    normalized.transcript_verified;
  if (pass) return "pass";
  if (mode === "weekly" && !normalized.wisp_call_seen && provenPreToolAbsence) {
    return "inconclusive";
  }
  return "fail";
}

export function buildCodexExecArgs(fixture, prompt) {
  return [
    "exec",
    "-c", 'approval_policy="on-request"',
    "-c", 'approvals_reviewer="auto_review"',
    "--json",
    "--ephemeral",
    "--skip-git-repo-check",
    "-C", fixture,
    prompt,
  ];
}

async function dashboardHealth(urlText, parentSignal) {
  const match = DASHBOARD_URL.exec(urlText);
  if (!match) return false;
  const url = new URL(urlText);
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (parentSignal?.aborted) return false;
  parentSignal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, DASHBOARD_HEALTH_TIMEOUT_MS);
  try {
    const response = await fetch(`${url.origin}/api/health`, {
      headers: { Authorization: `Bearer ${match[2]}` },
      signal: controller.signal,
    }).catch(() => undefined);
    return response?.status === 200;
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener("abort", abort);
  }
}

export function validCanonicalStatus(line, nonce) {
  let value;
  try {
    value = JSON.parse(line);
  } catch {
    return false;
  }
  if (!exactKeys(value, ["v", "ts", "run", "agent", "kind", "state", "activity"])) {
    return false;
  }
  return value.v === 1 &&
    typeof value.ts === "string" &&
    ISO_MILLISECONDS.test(value.ts) &&
    !Number.isNaN(new Date(value.ts).valueOf()) &&
    new Date(value.ts).toISOString() === value.ts &&
    value.run === nonce &&
    value.agent === "codex-canary" &&
    value.kind === "status" &&
    value.state === "working" &&
    value.activity === nonce;
}

function externalAbsence(text) {
  return EXTERNAL_ABSENCE.test(text);
}

export function execProvesPreToolAbsence(result) {
  return result.spawnError !== undefined ||
    typeof result.status === "number" &&
      result.status !== 0 &&
      externalAbsence(result.stderr.toString("utf8"));
}

async function installedVersion(codexHome, requested) {
  const root = join(codexHome, "plugins/cache/kodhama/wisp");
  if (requested) {
    await access(join(root, requested, ".codex-plugin/plugin.json"));
    return requested;
  }
  const versions = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && SEMVER.test(entry.name))
    .map((entry) => entry.name);
  if (versions.length !== 1) {
    throw new Error("marketplace install did not resolve one plugin version");
  }
  return versions[0];
}

export function workflowContext(env = process.env) {
  const workflowId = Number(env.GITHUB_RUN_ID);
  const repository = env.GITHUB_REPOSITORY;
  const sha = env.GITHUB_SHA;
  if (!Number.isSafeInteger(workflowId) || workflowId <= 0 ||
    !/^[^/\s]+\/[^/\s]+$/u.test(repository ?? "") ||
    !/^[0-9a-f]{40}$/u.test(sha ?? "")) {
    throw new Error("invalid GitHub workflow context");
  }
  return {
    workflow_id: workflowId,
    workflow_run_url: `https://github.com/${repository}/actions/runs/${workflowId}`,
    git_sha: sha,
  };
}

export function installOutcomeFailed(value) {
  if (value === undefined || value === "success") return false;
  if (value === "failure") return true;
  throw new Error("invalid Codex install outcome");
}

async function requireSuccess(result, proofOnNonzero) {
  if (result.spawnError) return { ok: false, provenAbsence: true };
  if (result.timedOut) {
    return { ok: false, provenAbsence: proofOnNonzero === true };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      provenAbsence: proofOnNonzero === true &&
        typeof result.status === "number" && result.status !== 0,
    };
  }
  return { ok: true, provenAbsence: false };
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const codexHome = process.env.CODEX_HOME;
  if (!codexHome || !isAbsolute(codexHome)) {
    throw new Error("CODEX_HOME must be absolute");
  }
  await mkdir(codexHome, { recursive: true, mode: 0o700 });
  await mkdir(args.output, { recursive: true, mode: 0o700 });
  const transcriptPath = join(args.output, "codex.jsonl");
  const evidencePath = join(args.output, "evidence.json");
  await writeFile(transcriptPath, "", { mode: 0o600 });
  const startedAt = new Date().toISOString();
  const context = workflowContext();
  let codexVersion = null;
  let pluginVersion = null;
  let bundleSha256 = null;
  let fixture;
  let nonce = `wisp-canary-${randomUUID()}`;
  let records = [];
  let everyLineParsed = true;
  let execStatus = null;
  let execTimedOut = false;
  let dashboardHealthPassed = false;
  let busPathVerified = false;
  let provenPreToolAbsence = false;
  let result = "fail";

  try {
    if (installOutcomeFailed(process.env.CODEX_INSTALL_OUTCOME)) {
      provenPreToolAbsence = true;
      throw new Error("Codex installation failed");
    }
    const versionResult = await runCommand("codex", ["--version"], {
      timeoutMs: VERSION_TIMEOUT_MS,
    });
    codexVersion = versionResult.stdout.toString("utf8").trim() || null;
    let outcome = await requireSuccess(versionResult, false);
    provenPreToolAbsence ||= outcome.provenAbsence;
    if (!outcome.ok || codexVersion === null) {
      throw new Error("codex version failed");
    }

    const marketplace = await runCommand("codex", [
      "plugin", "marketplace", "add",
      args["marketplace-source"],
      "--ref", args["marketplace-ref"],
      "--json",
    ], { timeoutMs: COMMAND_TIMEOUT_MS });
    outcome = await requireSuccess(marketplace, true);
    provenPreToolAbsence ||= outcome.provenAbsence;
    if (!outcome.ok) throw new Error("marketplace install failed");

    const install = await runCommand(
      "codex",
      ["plugin", "add", "wisp@kodhama", "--json"],
      { timeoutMs: COMMAND_TIMEOUT_MS },
    );
    outcome = await requireSuccess(install, true);
    provenPreToolAbsence ||= outcome.provenAbsence;
    if (!outcome.ok) throw new Error("plugin install failed");

    pluginVersion = await installedVersion(codexHome, args.version);
    const bundle = join(
      codexHome,
      "plugins/cache/kodhama/wisp",
      pluginVersion,
      "dist/wisp.mjs",
    );
    bundleSha256 = createHash("sha256").update(await readFile(bundle)).digest("hex");
    fixture = await mkdtemp(join(tmpdir(), "wisp-codex-canary-"));
    const prompt = [
      "Use Wisp MCP tools, not prose simulations.",
      `In order, call wisp_check with run ${nonce} and agent codex-canary;`,
      `then call wisp_status with run ${nonce}, agent codex-canary, state working, and activity ${nonce};`,
      "then call wisp_dashboard with an empty object. Return its exact result.",
    ].join(" ");
    const execution = await runCommand(
      "codex",
      buildCodexExecArgs(fixture, prompt),
      {
        cwd: fixture,
        timeoutMs: EXEC_TIMEOUT_MS,
        onStdoutLine: async (line, state) => {
          if (line.trim() === "") return;
          try {
            const value = JSON.parse(line);
            records.push(value);
            const observed = normalizeTranscript([value], {
              nonce,
              execStatus: 0,
              execTimedOut: false,
              everyLineParsed: true,
            });
            if (observed.dashboard_url !== undefined &&
              !dashboardHealthPassed &&
              state.childIsLive()) {
              dashboardHealthPassed = await dashboardHealth(
                observed.dashboard_url,
                state.signal,
              );
            }
          } catch {
            everyLineParsed = false;
          }
        },
      },
    );
    await writeFile(transcriptPath, execution.stdout, { mode: 0o600 });
    execStatus = execution.status;
    execTimedOut = execution.timedOut;
    provenPreToolAbsence ||= execProvesPreToolAbsence(execution);
    const busText = await readFile(
      join(fixture, ".wisp/events.ndjson"),
      "utf8",
    ).catch(() => "");
    busPathVerified = busText.split("\n").some((line) =>
      validCanonicalStatus(line, nonce)
    );
  } catch {
    // Result precedence is computed below from the exact accumulated evidence.
  } finally {
    if (fixture !== undefined) {
      await rm(fixture, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  const normalized = normalizeTranscript(records, {
    nonce,
    execStatus,
    execTimedOut,
    everyLineParsed,
  });
  result = classifyCanary({
    mode: args.mode,
    normalized,
    busPathVerified,
    dashboardHealthPassed,
    provenPreToolAbsence,
  });
  const evidence = {
    schema: 1,
    mode: args.mode,
    result,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    ...context,
    codex_version: codexVersion,
    plugin_version: pluginVersion,
    bundle_sha256: bundleSha256,
    completed_tools: normalized.completed_tools,
    check_passed: normalized.check_passed,
    write_passed: normalized.write_passed,
    bus_path_verified: busPathVerified,
    dashboard_call_passed: normalized.dashboard_call_passed,
    dashboard_health_passed: dashboardHealthPassed,
    transcript_verified: normalized.transcript_verified,
  };
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {
    mode: 0o600,
  });
  process.exitCode = result === "fail" ? 1 : 0;
}

const invokedPath = process.argv[1] === undefined
  ? undefined
  : pathToFileURL(resolve(process.argv[1])).href;
if (invokedPath === import.meta.url) {
  await main().catch(() => {
    process.exitCode = 2;
  });
}
