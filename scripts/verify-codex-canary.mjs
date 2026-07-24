#!/usr/bin/env node
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

const COMPLETED_TOOLS = [
  "wisp_check",
  "wisp_status",
  "wisp_dashboard",
];
const ARGUMENTS = ["--evidence", "--bundle", "--version", "--sha256"];
const EVIDENCE_KEYS = [
  "schema",
  "mode",
  "result",
  "started_at",
  "finished_at",
  "workflow_id",
  "workflow_run_url",
  "git_sha",
  "codex_version",
  "plugin_version",
  "bundle_sha256",
  "completed_tools",
  "check_passed",
  "write_passed",
  "bus_path_verified",
  "dashboard_call_passed",
  "dashboard_health_passed",
  "transcript_verified",
].sort();
const BOOLEAN_KEYS = [
  "check_passed",
  "write_passed",
  "bus_path_verified",
  "dashboard_call_passed",
  "dashboard_health_passed",
  "transcript_verified",
];
const ISO_MILLISECONDS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const SEMVER =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

function invalid() {
  process.exitCode = 2;
  throw new Error("invalid");
}

function parseArguments(argv) {
  if (argv.length !== ARGUMENTS.length * 2) invalid();
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!ARGUMENTS.includes(key) || values.has(key) || value === undefined || value === "") invalid();
    values.set(key, value);
  }
  if (values.size !== ARGUMENTS.length) invalid();
  return Object.fromEntries(ARGUMENTS.map((key) => [key.slice(2), values.get(key)]));
}

function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify(keys);
}

function validInstant(value) {
  return typeof value === "string" && ISO_MILLISECONDS.test(value) &&
    !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}

function validEvidence(value) {
  if (!exactKeys(value, EVIDENCE_KEYS)) return false;
  if (value.schema !== 1 || !["weekly", "candidate"].includes(value.mode) ||
    !["pass", "fail", "inconclusive"].includes(value.result)) return false;
  if (!validInstant(value.started_at) || !validInstant(value.finished_at) ||
    Date.parse(value.finished_at) < Date.parse(value.started_at)) return false;
  if (!Number.isSafeInteger(value.workflow_id) || value.workflow_id <= 0) return false;
  if (
    typeof value.workflow_run_url !== "string" ||
    value.workflow_run_url !==
      `https://github.com/${value.workflow_run_url.slice("https://github.com/".length).split("/actions/runs/")[0]}/actions/runs/${value.workflow_id}` ||
    !/^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/[1-9]\d*$/u.test(value.workflow_run_url)
  ) return false;
  if (typeof value.git_sha !== "string" || !/^[0-9a-f]{40}$/u.test(value.git_sha)) return false;
  if (value.codex_version !== null &&
    (typeof value.codex_version !== "string" || value.codex_version.trim() === "")) return false;
  if (value.plugin_version !== null &&
    (typeof value.plugin_version !== "string" || !SEMVER.test(value.plugin_version))) return false;
  if (value.bundle_sha256 !== null &&
    (typeof value.bundle_sha256 !== "string" ||
      !/^[0-9a-f]{64}$/u.test(value.bundle_sha256))) return false;
  if (!Array.isArray(value.completed_tools) ||
    value.completed_tools.length > COMPLETED_TOOLS.length ||
    new Set(value.completed_tools).size !== value.completed_tools.length ||
    value.completed_tools.some((tool) => !COMPLETED_TOOLS.includes(tool))) return false;
  if (BOOLEAN_KEYS.some((key) => typeof value[key] !== "boolean")) return false;
  if (value.result === "pass" &&
    (typeof value.codex_version !== "string" ||
      typeof value.plugin_version !== "string" ||
      typeof value.bundle_sha256 !== "string" ||
      JSON.stringify(value.completed_tools) !== JSON.stringify(COMPLETED_TOOLS))) return false;
  return true;
}

async function safeRegularFile(path) {
  if (!isAbsolute(path)) invalid();
  const info = await lstat(path).catch(invalid);
  if (info.isSymbolicLink() || !info.isFile()) invalid();
  return realpath(path).catch(invalid);
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const codexHomeText = process.env.CODEX_HOME;
  if (codexHomeText === undefined || codexHomeText.trim() === "" || !isAbsolute(codexHomeText)) invalid();
  if (!SEMVER.test(args.version) || !/^[0-9a-f]{64}$/u.test(args.sha256)) invalid();

  const evidenceReal = await safeRegularFile(args.evidence);
  const bundleReal = await safeRegularFile(args.bundle);
  const codexHome = await realpath(codexHomeText).catch(invalid);
  const expectedBundle = resolve(
    join(codexHome, "plugins", "cache", "kodhama", "wisp", args.version, "dist", "wisp.mjs"),
  );
  if (bundleReal !== expectedBundle) invalid();

  let evidence;
  try {
    evidence = JSON.parse(await readFile(evidenceReal, "utf8"));
  } catch {
    invalid();
  }
  if (!validEvidence(evidence)) invalid();

  const bytes = await readFile(bundleReal).catch(invalid);
  const actualHash = createHash("sha256").update(bytes).digest("hex");
  const matches = evidence.mode === "candidate" &&
    evidence.result === "pass" &&
    evidence.plugin_version === args.version &&
    evidence.bundle_sha256 === args.sha256 &&
    actualHash === args.sha256 &&
    JSON.stringify(evidence.completed_tools) === JSON.stringify(COMPLETED_TOOLS) &&
    BOOLEAN_KEYS.every((key) => evidence[key] === true);
  process.exitCode = matches ? 0 : 1;
}

await main().catch(() => {
  if (process.exitCode !== 2) process.exitCode = 2;
});
