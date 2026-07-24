// SPEC-0002 v5 (restored v2 behavior): S6 / R6 — exact candidate evidence verifier.
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const verifier = resolve("scripts/verify-codex-canary.mjs");
const tools = [
  "wisp_check",
  "wisp_status",
  "wisp_dashboard",
];

async function fixture(overrides: Record<string, unknown> = {}) {
  const root = await mkdtemp(join(tmpdir(), "wisp-canary-verifier-"));
  const codexHome = join(root, "codex");
  const version = "0.2.0";
  const bundle = join(
    codexHome,
    "plugins/cache/kodhama/wisp",
    version,
    "dist/wisp.mjs",
  );
  await mkdir(resolve(bundle, ".."), { recursive: true });
  await writeFile(bundle, "candidate bytes\n");
  const sha256 = createHash("sha256").update("candidate bytes\n").digest("hex");
  const evidence = {
    schema: 1,
    mode: "candidate",
    result: "pass",
    started_at: "2026-07-24T10:00:00.000Z",
    finished_at: "2026-07-24T10:01:00.000Z",
    workflow_id: 123,
    workflow_run_url: "https://github.com/kodhama/wisp/actions/runs/123",
    git_sha: "a".repeat(40),
    codex_version: "codex-cli 1.2.3",
    plugin_version: version,
    bundle_sha256: sha256,
    completed_tools: tools,
    check_passed: true,
    write_passed: true,
    bus_path_verified: true,
    dashboard_call_passed: true,
    dashboard_health_passed: true,
    transcript_verified: true,
    ...overrides,
  };
  const evidencePath = join(root, "evidence.json");
  await writeFile(evidencePath, JSON.stringify(evidence));
  return { root, codexHome, version, bundle, sha256, evidencePath, evidence };
}

function run(
  value: Awaited<ReturnType<typeof fixture>>,
  extra: string[] = [],
  env: NodeJS.ProcessEnv = {},
) {
  return spawnSync(
    process.execPath,
    [
      verifier,
      "--evidence", value.evidencePath,
      "--bundle", value.bundle,
      "--version", value.version,
      "--sha256", value.sha256,
      ...extra,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, CODEX_HOME: value.codexHome, ...env },
    },
  );
}

describe("SPEC-0002 v5 candidate verifier", () => {
  it("accepts only exact passing candidate evidence and bundle bytes", async () => {
    const value = await fixture();
    const result = run(value);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("returns 1 for valid negative evidence or candidate identity mismatch", async () => {
    for (const overrides of [
      { result: "fail" },
      { result: "inconclusive" },
      { write_passed: false },
      { result: "fail", completed_tools: [...tools].reverse() },
      {
        result: "fail",
        codex_version: null,
        plugin_version: null,
        bundle_sha256: null,
      },
    ]) {
      const value = await fixture(overrides);
      expect(run(value).status).toBe(1);
    }
    const value = await fixture();
    expect(run(value, ["--version", value.version]).status).toBe(2);
    const evidenceMismatch = await fixture({ plugin_version: "0.2.1" });
    expect(run(evidenceMismatch).status).toBe(1);
  });

  it("returns 2 for bad arguments, schema, missing home, unsafe paths, or symlinks", async () => {
    const unknown = await fixture();
    expect(run(unknown, ["--unknown", "x"]).status).toBe(2);
    expect(run(unknown, [], { CODEX_HOME: "" }).status).toBe(2);

    const invalidSchema = await fixture({ surprise: true });
    expect(run(invalidSchema).status).toBe(2);

    const wrongPath = await fixture();
    const outside = join(wrongPath.root, "outside.mjs");
    await writeFile(outside, "candidate bytes\n");
    expect(
      spawnSync(process.execPath, [
        verifier,
        "--evidence", wrongPath.evidencePath,
        "--bundle", outside,
        "--version", wrongPath.version,
        "--sha256", wrongPath.sha256,
      ], {
        encoding: "utf8",
        env: { ...process.env, CODEX_HOME: wrongPath.codexHome },
      }).status,
    ).toBe(2);

    const linked = await fixture();
    const realBundle = join(linked.root, "real.mjs");
    await writeFile(realBundle, "candidate bytes\n");
    await writeFile(linked.bundle, "");
    const linkPath = `${linked.bundle}.link`;
    await symlink(realBundle, linkPath);
    expect(
      spawnSync(process.execPath, [
        verifier,
        "--evidence", linked.evidencePath,
        "--bundle", linkPath,
        "--version", linked.version,
        "--sha256", linked.sha256,
      ], {
        encoding: "utf8",
        env: { ...process.env, CODEX_HOME: linked.codexHome },
      }).status,
    ).toBe(2);
  });

  it("never emits fixture paths or evidence contents", async () => {
    const value = await fixture({ surprise: true });
    const result = run(value);
    expect(result.status).toBe(2);
    expect(`${result.stdout}${result.stderr}`).not.toContain(value.root);
    expect(`${result.stdout}${result.stderr}`).not.toContain("candidate bytes");
  });
});
