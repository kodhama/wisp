import { spawn } from "node:child_process";
import {
  appendFile,
  mkdir,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

export const CAPABILITY_REDACTION_ERROR =
  "error: browser-capability-redaction-failed\n";
export const DEFAULT_OUTPUT_LIMIT_BYTES = 4 * 1024 * 1024;

const CAPABILITY = "[A-Za-z0-9_-]{43}";
const FRAGMENT = new RegExp(`#capability=(${CAPABILITY})`, "gu");
const BEARER = new RegExp(`Bearer (${CAPABILITY})`, "gu");
const STANDALONE_CAPABILITY = new RegExp(
  `(?<![A-Za-z0-9_-])${CAPABILITY}(?![A-Za-z0-9_-])`,
  "gu",
);
const decoder = new TextDecoder("utf-8", { fatal: true });

function safetyError() {
  return new Error(CAPABILITY_REDACTION_ERROR.trim());
}

function text(bytes) {
  if (!Buffer.isBuffer(bytes)) throw safetyError();
  try {
    return decoder.decode(bytes);
  } catch {
    throw safetyError();
  }
}

function uniqueCapabilities(values) {
  return [...new Set(values.filter((value) =>
    typeof value === "string" && /^[A-Za-z0-9_-]{43}$/u.test(value)
  ))];
}

// Un-exported by adr-0018: its only external consumer was removed, but
// `runSanitizedCommand` below still calls it, so the function itself stays.
function extractCapabilities(bytes) {
  const value = text(bytes);
  return uniqueCapabilities([
    ...[...value.matchAll(FRAGMENT)].map((match) => match[1]),
    ...[...value.matchAll(BEARER)].map((match) => match[1]),
  ]);
}

function transformCapabilityBytes(bytes) {
  let value = text(bytes);
  value = value
    .replace(FRAGMENT, "#capability=<redacted>")
    .replace(BEARER, "Bearer <redacted>");
  return Buffer.from(value, "utf8");
}

function extractAndStripControlFrames(bytes, nonce) {
  let value = text(bytes);
  const capabilityPrefix = "\x1eWISP_CAPABILITY:";
  const stagePrefix = "\x1eWISP_STAGE:";
  const failurePrefix = "\x1eWISP_FAILURE:";
  if (
    !value.includes(capabilityPrefix) &&
    !value.includes(stagePrefix) &&
    !value.includes(failurePrefix)
  ) {
    return { bytes, observed: [], stages: [], failures: [] };
  }
  if (typeof nonce !== "string" || nonce.length < 8) throw safetyError();
  const escapedNonce = nonce.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const capabilityFrame = new RegExp(
    `\\x1eWISP_CAPABILITY:${escapedNonce}:(${CAPABILITY})\\x1f`,
    "gu",
  );
  const stageFrame = new RegExp(
    `\\x1eWISP_STAGE:${escapedNonce}:([a-z-]+):([a-z]+)\\x1f`,
    "gu",
  );
  const failureFrame = new RegExp(
    `\\x1eWISP_FAILURE:${escapedNonce}:([a-z-]+):([a-z]+)\\x1f`,
    "gu",
  );
  const observed = [...value.matchAll(capabilityFrame)]
    .map((match) => match[1]);
  const stages = [...value.matchAll(stageFrame)]
    .map((match) => `${match[1]}:${match[2]}`);
  const failures = [...value.matchAll(failureFrame)]
    .map((match) => `${match[1]}:${match[2]}`);
  value = value
    .replace(capabilityFrame, "")
    .replace(stageFrame, "")
    .replace(failureFrame, "");
  if (
    value.includes(capabilityPrefix) ||
    value.includes(stagePrefix) ||
    value.includes(failurePrefix) ||
    value.includes("\x1f")
  ) {
    throw safetyError();
  }
  return { bytes: Buffer.from(value, "utf8"), observed, stages, failures };
}

function extractLifecycleFramesOnly(bytes, nonce, kind) {
  if (typeof nonce !== "string" || nonce.length < 8) return [];
  try {
    const escapedNonce = nonce.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const frame = new RegExp(
      `\\x1eWISP_${kind}:${escapedNonce}:([a-z-]+):([a-z]+)\\x1f`,
      "gu",
    );
    return [...text(bytes).matchAll(frame)]
      .map((match) => `${match[1]}:${match[2]}`);
  } catch {
    return [];
  }
}

function sanitizeBrowserBytes(bytes, observedCapabilities, redactStandalone) {
  let sanitized = transformCapabilityBytes(bytes);
  let value = text(sanitized);
  for (const capability of uniqueCapabilities(observedCapabilities)) {
    value = value.split(capability).join("<redacted>");
  }
  sanitized = Buffer.from(value, "utf8");
  if (redactStandalone) {
    sanitized = Buffer.from(
      text(sanitized).replace(STANDALONE_CAPABILITY, "<redacted>"),
      "utf8",
    );
  }
  assertCapabilityAbsent(sanitized, observedCapabilities);
  return sanitized;
}

export function assertCapabilityAbsent(bytes, observedCapabilities = []) {
  const value = text(bytes);
  const observed = uniqueCapabilities(observedCapabilities);
  if (
    observed.some((capability) => value.includes(capability)) ||
    new RegExp(`#capability=${CAPABILITY}`, "u").test(value) ||
    new RegExp(`Bearer ${CAPABILITY}`, "u").test(value)
  ) {
    throw safetyError();
  }
}

async function clear(paths) {
  await Promise.all(paths.map((path) =>
    rm(path, { force: true }).catch(() => undefined)
  ));
}

export async function writeBrowserEvidence(
  path,
  evidence,
  observedCapabilities,
  hooks = {},
) {
  const prepared = prepareBrowserEvidence(
    evidence,
    observedCapabilities,
    hooks,
  );
  await persistPreparedBrowserEvidence(path, prepared.bytes);
}

export function prepareBrowserEvidence(
  evidence,
  observedCapabilities,
  hooks = {},
) {
  let discarded = false;
  const discard = () => {
    if (discarded) return;
    discarded = true;
    hooks.onDiscard?.();
  };
  try {
    const frozenEvidence = Object.freeze({ ...evidence });
    hooks.onFreeze?.(frozenEvidence);
    validateBrowserEvidence(frozenEvidence);
    hooks.onValidate?.(frozenEvidence);
    const bytes = Buffer.from(
      `${JSON.stringify(frozenEvidence, null, 2)}\n`,
      "utf8",
    );
    hooks.onSerialize?.(bytes);
    assertCapabilityAbsent(bytes, observedCapabilities);
    hooks.onScan?.(bytes);
    discard();
    return Object.freeze({ evidence: frozenEvidence, bytes });
  } catch {
    discard();
    throw safetyError();
  }
}

export async function persistPreparedBrowserEvidence(path, bytes) {
  if (!Buffer.isBuffer(bytes)) throw safetyError();
  await writeFile(path, bytes, { mode: 0o600 });
}

const FAILURE_STAGES = new Set([
  "pre-dashboard",
  "dashboard-call",
  "browser-launch",
  "navigation",
  "dom",
  "authorization",
  "cleanup",
  "redaction",
]);
const LOOPBACK_ORIGIN = /^http:\/\/127\.0\.0\.1:([1-9]\d{0,4})$/u;

function validPort(origin) {
  const match = LOOPBACK_ORIGIN.exec(origin);
  if (!match) return false;
  const port = Number(match[1]);
  return port >= 1 && port <= 65535;
}

export function validateBrowserEvidence(evidence) {
  const expected = [
    "authenticated_health_status",
    "authorization_shape",
    "dashboard_url_shape",
    "external_request_count",
    "failure_stage",
    "fragment_removed",
    "loopback_origin",
    "result",
    "schema",
  ].sort();
  if (
    evidence === null ||
    typeof evidence !== "object" ||
    Array.isArray(evidence) ||
    JSON.stringify(Object.keys(evidence).sort()) !== JSON.stringify(expected)
  ) {
    throw safetyError();
  }
  const nullable = (value, predicate) => value === null || predicate(value);
  const originValid = nullable(
    evidence.loopback_origin,
    (value) => typeof value === "string" && validPort(value),
  );
  const dashboardValid = nullable(
    evidence.dashboard_url_shape,
    (value) =>
      typeof value === "string" &&
      typeof evidence.loopback_origin === "string" &&
      value === `${evidence.loopback_origin}/#capability=<redacted>`,
  );
  const commonValid =
    evidence.schema === 1 &&
    (evidence.result === "pass" || evidence.result === "fail") &&
    originValid &&
    dashboardValid &&
    nullable(
      evidence.authorization_shape,
      (value) => value === "Bearer <redacted>",
    ) &&
    nullable(evidence.fragment_removed, (value) => typeof value === "boolean") &&
    nullable(
      evidence.authenticated_health_status,
      (value) => Number.isInteger(value) && value >= 100 && value <= 599,
    ) &&
    Number.isSafeInteger(evidence.external_request_count) &&
    evidence.external_request_count >= 0;
  const stageValid = evidence.result === "pass"
    ? evidence.failure_stage === null
    : FAILURE_STAGES.has(evidence.failure_stage);
  const passValid = evidence.result !== "pass" || (
    typeof evidence.loopback_origin === "string" &&
    evidence.dashboard_url_shape ===
      `${evidence.loopback_origin}/#capability=<redacted>` &&
    evidence.authorization_shape === "Bearer <redacted>" &&
    evidence.fragment_removed === true &&
    evidence.authenticated_health_status === 200 &&
    evidence.external_request_count === 0
  );
  if (!commonValid || !stageValid || !passValid) throw safetyError();
  return evidence;
}

export async function runSanitizedCommand(command, args, options = {}) {
  const limit = options.maxOutputBytes ?? DEFAULT_OUTPUT_LIMIT_BYTES;
  const timeoutMs = options.timeoutMs ?? 120_000;
  const killGraceMs = options.killGraceMs ?? 2_000;
  return new Promise((resolveRun) => {
    const stdout = [];
    const stderr = [];
    let total = 0;
    let unsafe = false;
    let spawnError = false;
    let timedOut = false;
    let killTimer;
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      detached: process.platform !== "win32",
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
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
        // The process may already have exited.
      }
    };
    const terminateWithGrace = () => {
      terminate("SIGTERM");
      killTimer ??= setTimeout(() => terminate("SIGKILL"), killGraceMs);
    };
    const append = (target, chunk) => {
      if (unsafe) return;
      const bytes = Buffer.from(chunk);
      total += bytes.byteLength;
      if (total > limit) {
        unsafe = true;
        terminateWithGrace();
        return;
      }
      target.push(bytes);
    };
    const deadline = setTimeout(() => {
      timedOut = true;
      terminateWithGrace();
    }, timeoutMs);
    child.stdout.on("data", (chunk) => append(stdout, chunk));
    child.stderr.on("data", (chunk) => append(stderr, chunk));
    child.once("error", (error) => {
      spawnError = true;
      append(stderr, Buffer.from(error.message));
    });
    child.once("close", (status, signal) => {
      clearTimeout(deadline);
      if (timedOut || unsafe) terminate("SIGKILL");
      if (killTimer !== undefined) clearTimeout(killTimer);
      if (unsafe) {
        if (options.emit !== false) {
          process.stderr.write(CAPABILITY_REDACTION_ERROR);
        }
        resolveRun({
          status: 1,
          signal,
          timedOut,
          safetyFailed: true,
          spawnError,
        });
        return;
      }
      try {
        const stdoutFrames = extractAndStripControlFrames(
          Buffer.concat(stdout),
          options.controlNonce,
        );
        const stderrFrames = extractAndStripControlFrames(
          Buffer.concat(stderr),
          options.controlNonce,
        );
        const rawStdout = stdoutFrames.bytes;
        const rawStderr = stderrFrames.bytes;
        const observed = uniqueCapabilities([
          ...stdoutFrames.observed,
          ...stderrFrames.observed,
          ...extractCapabilities(rawStdout),
          ...extractCapabilities(rawStderr),
        ]);
        const controlStages = [
          ...new Set([...stdoutFrames.stages, ...stderrFrames.stages]),
        ];
        const controlFailures = [
          ...new Set([...stdoutFrames.failures, ...stderrFrames.failures]),
        ];
        const safeStdout = sanitizeBrowserBytes(
          rawStdout,
          observed,
          options.redactStandaloneCapabilities === true,
        );
        const safeStderr = sanitizeBrowserBytes(
          rawStderr,
          observed,
          options.redactStandaloneCapabilities === true,
        );
        if (options.emit !== false) {
          process.stdout.write(safeStdout);
          process.stderr.write(safeStderr);
        }
        resolveRun({
          status: spawnError ? 1 : status,
          signal,
          timedOut,
          safetyFailed: false,
          spawnError,
          controlStages,
          controlFailures,
          stdout: safeStdout,
          stderr: safeStderr,
        });
      } catch {
        const controlStages = [
          ...new Set([
            ...extractLifecycleFramesOnly(
              Buffer.concat(stdout),
              options.controlNonce,
              "STAGE",
            ),
            ...extractLifecycleFramesOnly(
              Buffer.concat(stderr),
              options.controlNonce,
              "STAGE",
            ),
          ]),
        ];
        const controlFailures = [
          ...new Set([
            ...extractLifecycleFramesOnly(
              Buffer.concat(stdout),
              options.controlNonce,
              "FAILURE",
            ),
            ...extractLifecycleFramesOnly(
              Buffer.concat(stderr),
              options.controlNonce,
              "FAILURE",
            ),
          ]),
        ];
        if (options.emit !== false) {
          process.stderr.write(CAPABILITY_REDACTION_ERROR);
        }
        resolveRun({
          status: 1,
          signal,
          timedOut,
          safetyFailed: true,
          spawnError,
          controlStages,
          controlFailures,
        });
      }
    });
  });
}

export async function directoryIsAbsentOrEmpty(path) {
  try {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (!entry.isDirectory()) return false;
      if (!await directoryIsAbsentOrEmpty(join(path, entry.name))) return false;
    }
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
}
