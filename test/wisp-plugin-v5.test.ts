// SPEC-0001@v11: S2, S20, S23, S28, S65-S69 / R1-R3, R24-R28,
// R34, R37, R55, R57, R73-R77.
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const plugin = join(process.cwd(), "plugins/wisp");
const UNVERIFIED_SUFFIX =
  "Marketplace observation provenance is unverified; structural validation does not authenticate the named run.";
const CATALOG_NON_EVIDENCE = (version: string): string =>
  `Stewards catalog admission and marketplace registration for ${version} are not evidenced.`;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function validSemver(value: string): boolean {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u
      .exec(value);
  if (!match) return false;
  return match[4] === undefined ||
    match[4].split(".").every((identifier) =>
      !/^\d+$/u.test(identifier) || identifier === "0" || !identifier.startsWith("0"));
}

function normalizedJsonPath(value: unknown): value is string {
  return typeof value === "string" &&
    value.endsWith(".json") &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

function validObservation(
  value: unknown,
  host: string,
  surfaceId: string,
): boolean {
  if (!record(value) ||
    !exactKeys(value, [
      "schema_version",
      "host",
      "surface_id",
      "marketplace",
      "execution",
      "observed_at",
    ]) ||
    value.schema_version !== 1 ||
    value.host !== host ||
    value.surface_id !== surfaceId ||
    !record(value.marketplace) ||
    !record(value.execution)) return false;

  const marketplace = value.marketplace;
  const execution = value.execution;
  if (!exactKeys(marketplace, ["name", "repository", "revision"]) ||
    typeof marketplace.name !== "string" ||
    marketplace.name.trim() === "" ||
    Buffer.byteLength(marketplace.name) > 128 ||
    typeof marketplace.repository !== "string" ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(marketplace.repository) ||
    typeof marketplace.revision !== "string" ||
    !/^[0-9a-f]{40}$/u.test(marketplace.revision) ||
    !exactKeys(execution, [
      "repository",
      "commit",
      "workflow",
      "job",
      "run_id",
      "run_attempt",
      "setup_step_id",
    ]) ||
    typeof execution.repository !== "string" ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(execution.repository) ||
    typeof execution.commit !== "string" ||
    !/^[0-9a-f]{40}$/u.test(execution.commit) ||
    typeof execution.workflow !== "string" ||
    !/^\.github\/workflows\/[^/].*\.ya?ml$/u.test(execution.workflow) ||
    execution.workflow.includes("\\") ||
    execution.workflow.split("/").some((part) => part === "." || part === "..") ||
    typeof execution.job !== "string" ||
    execution.job.trim() === "" ||
    Buffer.byteLength(execution.job) > 128 ||
    !Number.isInteger(execution.run_id) ||
    Number(execution.run_id) <= 0 ||
    !Number.isInteger(execution.run_attempt) ||
    Number(execution.run_attempt) <= 0 ||
    typeof execution.setup_step_id !== "string" ||
    !/^[A-Za-z_][A-Za-z0-9_-]{0,127}$/u.test(execution.setup_step_id) ||
    typeof value.observed_at !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value.observed_at) ||
    Number.isNaN(new Date(value.observed_at).valueOf()) ||
    new Date(value.observed_at).toISOString() !== value.observed_at) return false;

  return true;
}

function validSurfaces(
  value: unknown,
  version: string,
  qualification: Record<string, unknown>,
  observations: Record<string, unknown>,
): boolean {
  if (!record(value) ||
    !exactKeys(value, ["schema_version", "version", "rows"]) ||
    value.schema_version !== 1 ||
    value.version !== version ||
    !Array.isArray(value.rows)) return false;
  const ids = new Set<string>();
  for (const candidate of value.rows) {
    if (!record(candidate) ||
      !exactKeys(candidate, [
        "surface_id",
        "host",
        "qualification_path",
        "qualification_key",
        "marketplace_test_observations",
        "disclosure",
      ]) ||
      typeof candidate.surface_id !== "string" ||
      !/^[a-z0-9][a-z0-9._/-]{0,127}$/u.test(candidate.surface_id) ||
      ids.has(candidate.surface_id) ||
      !["claude", "codex"].includes(String(candidate.host)) ||
      candidate.qualification_path !== "qualification.json" ||
      candidate.qualification_key !== candidate.host ||
      !record(qualification[String(candidate.qualification_key)]) ||
      !Array.isArray(candidate.marketplace_test_observations) ||
      typeof candidate.disclosure !== "string" ||
      candidate.disclosure.trim() === "") return false;
    ids.add(candidate.surface_id);
    for (const path of candidate.marketplace_test_observations) {
      if (!normalizedJsonPath(path) ||
        !validObservation(
          observations[path],
          String(candidate.host),
          candidate.surface_id,
        )) return false;
    }
    const qualificationResult =
      (qualification[String(candidate.qualification_key)] as Record<string, unknown>).result;
    if (!["pending", "pass", "fail"].includes(String(qualificationResult))) return false;
    const prefix = qualificationResult === "pending"
      ? "Qualification is pending;"
      : qualificationResult === "pass"
      ? "Qualification passed;"
      : "Qualification failed;";
    const expectedDisclosure = `${prefix} ${CATALOG_NON_EVIDENCE(version)}${
      candidate.marketplace_test_observations.length > 0 ? ` ${UNVERIFIED_SUFFIX}` : ""
    }`;
    if (candidate.disclosure !== expectedDisclosure) return false;
  }
  return true;
}

async function inventory(path = plugin): Promise<string[]> {
  const result: string[] = [];
  async function visit(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await visit(full);
      else result.push(relative(path, full));
    }
  }
  await visit(path);
  return result.sort();
}

describe("SPEC-0001@v11 S20/S23/S28/S65-S69 — exact dual-host MCP-only payload", () => {
  it("contains exactly the ten candidate files", async () => {
    expect(await inventory()).toEqual([
      ".claude-plugin/plugin.json",
      ".codex-plugin/plugin.json",
      ".mcp.json",
      "README.md",
      "VERSION",
      "dist/wisp.mjs",
      "qualification.json",
      "skills/dashboard/SKILL.md",
      "skills/wisp/SKILL.md",
      "surfaces.json",
    ]);
  });

  it("derives every package carrier from strict canonical VERSION semantics", async () => {
    const versionBytes = await readFile(join(plugin, "VERSION"), "utf8");
    expect(versionBytes).toBe("0.2.1-rc.3\n");
    const version = versionBytes.slice(0, -1);
    expect(validSemver(version)).toBe(true);
    for (const valid of ["0.0.0", "1.2.3-0", "1.2.3-01a", "1.2.3-a.01b", "1.2.3+01"]) {
      expect(validSemver(valid), valid).toBe(true);
    }
    for (const invalid of ["01.2.3", "1.02.3", "1.2.03", "1.2.3-01", "1.2.3-", "1.2.3+"]) {
      expect(validSemver(invalid), invalid).toBe(false);
    }

    const claude = JSON.parse(await readFile(join(plugin, ".claude-plugin/plugin.json"), "utf8"));
    const codex = JSON.parse(await readFile(join(plugin, ".codex-plugin/plugin.json"), "utf8"));
    const packageJson = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8"));
    const packageLock = JSON.parse(await readFile(join(process.cwd(), "package-lock.json"), "utf8"));
    const qualification = JSON.parse(await readFile(join(plugin, "qualification.json"), "utf8"));
    const surfaces = JSON.parse(await readFile(join(plugin, "surfaces.json"), "utf8"));
    const source = await readFile(join(process.cwd(), "src/mcp.ts"), "utf8");
    const bundle = await readFile(join(plugin, "dist/wisp.mjs"), "utf8");
    expect([
      claude.version,
      codex.version,
      packageJson.version,
      packageLock.version,
      packageLock.packages[""].version,
      qualification.plugin_version,
      surfaces.version,
    ]).toEqual(Array(7).fill(version));
    expect(source).toContain(`{ name: "wisp", version: "${version}" }`);
    expect(bundle).toContain(`{ name: "wisp", version: "${version}" }`);
    const buildScript = await readFile(join(process.cwd(), "scripts/build-plugin.mjs"), "utf8");
    expect(buildScript).toContain(
      'import { ESBUILD_NODE_TARGET } from "./node-support.mjs";',
    );
    expect(buildScript).toMatch(/\btarget:\s*ESBUILD_NODE_TARGET/u);
    expect(buildScript).not.toMatch(/\btarget:\s*"node(?:20|22|24)"/u);
  });

  it("has exact host launch definitions with no CLI/bin", async () => {
    const version = (await readFile(join(plugin, "VERSION"), "utf8")).trimEnd();
    const claude = JSON.parse(await readFile(join(plugin, ".claude-plugin/plugin.json"), "utf8"));
    const codex = JSON.parse(await readFile(join(plugin, ".codex-plugin/plugin.json"), "utf8"));
    const claudeMcp = JSON.parse(await readFile(join(plugin, ".mcp.json"), "utf8"));
    expect(codex.version).toBe(claude.version);
    expect(claude.bin).toBeUndefined();
    expect(codex.bin).toBeUndefined();
    const codexServer = codex.mcpServers.wisp;
    expect(codexServer).toEqual({
      command: "node",
      args: ["-e", expect.any(String)],
      env_vars: ["CODEX_HOME"],
    });
    const bootstrap = codexServer.args[1];
    expect(bootstrap).toContain("process.env.WISP_PROJECT_ROOT=process.cwd()");
    expect(bootstrap).toContain(
      `'plugins','cache','kodhama','wisp','${version}','dist','wisp.mjs'`,
    );
    expect(bootstrap).toContain("process.env.CODEX_HOME");
    expect(bootstrap).not.toMatch(
      /CLAUDE|PLUGIN_ROOT|npm|npx|fetch|https?:|child_process|process\.stdout|console\.log/u,
    );
    expect(claudeMcp).toEqual({
      mcpServers: {
        wisp: {
          command: "node",
          args: ["${CLAUDE_PLUGIN_ROOT}/dist/wisp.mjs"],
          env: { WISP_PROJECT_ROOT: "${CLAUDE_PROJECT_DIR}" },
        },
      },
    });
  });

  it("keeps both skills portable and qualification evidence coherent with the real bundle digest", async () => {
    const skill = await readFile(join(plugin, "skills/wisp/SKILL.md"), "utf8");
    expect(skill).toContain("wisp_status");
    expect(skill).toContain("wisp_check");
    expect(skill).not.toMatch(/Grove|grove|\/|node |npm |npx |shell|auto.?obey/i);
    const dashboardSkill = await readFile(
      join(plugin, "skills/dashboard/SKILL.md"),
      "utf8",
    );
    expect(dashboardSkill).toContain("wisp_dashboard");
    expect(dashboardSkill).toMatch(/open|show|start/i);
    expect(dashboardSkill).toMatch(/exact|returned/i);
    expect(dashboardSkill).not.toMatch(
      /https?:\/\/|```|child_process|\.grove\/|(?:^|\n)\s*(?:node|npm|npx|open|xdg-open)\s/imu,
    );

    const bundle = await readFile(join(plugin, "dist/wisp.mjs"));
    const qualification = JSON.parse(await readFile(join(plugin, "qualification.json"), "utf8"));
    expect(qualification.artifact_sha256).toBe(createHash("sha256").update(bundle).digest("hex"));
    expect(Object.keys(qualification).sort()).toEqual([
      "architecture",
      "artifact_sha256",
      "claude",
      "codex",
      "dashboard",
      "date",
      "node_versions",
      "platform",
      "plugin_version",
      "result",
    ]);
    expect(qualification.plugin_version).toBe(
      (await readFile(join(plugin, "VERSION"), "utf8")).trimEnd(),
    );
    expect(qualification.date).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    const [year, month, day] = qualification.date.split("-").map(Number);
    expect(
      new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10),
    ).toBe(qualification.date);
    expect(qualification.platform).toMatch(/^[a-z0-9]+$/u);
    expect(qualification.architecture).toMatch(/^[a-z0-9_]+$/u);
    if (qualification.dashboard.process_identity_passed) {
      expect(["darwin", "linux"]).toContain(qualification.platform);
    }
    expect(Object.keys(qualification.node_versions)).toEqual(["24"]);
    expect(qualification.node_versions).not.toHaveProperty("20");
    expect(qualification.node_versions).not.toHaveProperty("22");
    const nodeEvidence = qualification.node_versions["24"];
    expect(Object.keys(nodeEvidence).sort()).toEqual(["result", "version"]);
    expect(nodeEvidence.version).toMatch(/^(?:pending|24\.\d+\.\d+)$/u);
    expect(["pending", "pass", "fail"]).toContain(nodeEvidence.result);
    if (nodeEvidence.result === "pass") expect(nodeEvidence.version).not.toBe("pending");
    expect(Object.keys(qualification.dashboard).sort()).toEqual([
      "claude_open_passed",
      "cleanup_recovery_passed",
      "codex_open_passed",
      "command_append_passed",
      "cross_host_singleton_passed",
      "explicit_start_only",
      "process_identity_passed",
      "project_isolation_passed",
      "result",
      "security_passed",
    ]);
    expect(["pending", "pass", "fail"]).toContain(qualification.dashboard.result);
    for (const field of [
      "explicit_start_only",
      "claude_open_passed",
      "codex_open_passed",
      "cross_host_singleton_passed",
      "project_isolation_passed",
      "command_append_passed",
      "security_passed",
      "cleanup_recovery_passed",
      "process_identity_passed",
    ] as const) {
      expect(qualification.dashboard[field]).toEqual(expect.any(Boolean));
    }
    if (qualification.dashboard.result === "pass") {
      expect([
        qualification.dashboard.explicit_start_only,
        qualification.dashboard.claude_open_passed,
        qualification.dashboard.codex_open_passed,
        qualification.dashboard.cross_host_singleton_passed,
        qualification.dashboard.project_isolation_passed,
        qualification.dashboard.command_append_passed,
        qualification.dashboard.security_passed,
        qualification.dashboard.cleanup_recovery_passed,
        qualification.dashboard.process_identity_passed,
      ]).toEqual([true, true, true, true, true, true, true, true, true]);
    }
    for (const host of ["claude", "codex"] as const) {
      const evidence = qualification[host];
      expect(Object.keys(evidence).sort()).toEqual([
        "bus_path_verified",
        "check_passed",
        "result",
        "tools_listed",
        "version",
        "write_passed",
      ]);
      expect(evidence.version).toEqual(expect.any(String));
      expect(evidence.version.trim()).not.toBe("");
      expect(["pending", "pass", "fail"]).toContain(evidence.result);
      for (const field of [
        "tools_listed",
        "check_passed",
        "write_passed",
        "bus_path_verified",
      ] as const) {
        expect(evidence[field]).toEqual(expect.any(Boolean));
      }
      if (evidence.result === "pass") {
        expect(evidence.version).not.toBe("pending");
        expect([
          evidence.tools_listed,
          evidence.check_passed,
          evidence.write_passed,
          evidence.bus_path_verified,
        ]).toEqual([true, true, true, true]);
      }
    }
    expect(["pending", "pass", "fail"]).toContain(qualification.result);
    if (qualification.result === "pass") {
      expect([
        ...Object.values(
          qualification.node_versions as Record<string, { result: string }>,
        ).map((value) => value.result),
        qualification.claude.result,
        qualification.codex.result,
        qualification.dashboard.result,
      ]).toEqual(["pass", "pass", "pass", "pass"]);
    }
  });

  it("keeps surface, qualification, and marketplace facts separate and fail-closed", async () => {
    const version = (await readFile(join(plugin, "VERSION"), "utf8")).trimEnd();
    const qualification = JSON.parse(
      await readFile(join(plugin, "qualification.json"), "utf8"),
    );
    const surfaces = JSON.parse(await readFile(join(plugin, "surfaces.json"), "utf8"));
    expect(validSurfaces(surfaces, version, qualification, {})).toBe(true);
    expect(surfaces.rows).toEqual([
      {
        surface_id: "claude-interactive",
        host: "claude",
        qualification_path: "qualification.json",
        qualification_key: "claude",
        marketplace_test_observations: [],
        disclosure:
          `Qualification is pending; Stewards catalog admission and marketplace registration for ${version} are not evidenced.`,
      },
      {
        surface_id: "codex-cli-local-session",
        host: "codex",
        qualification_path: "qualification.json",
        qualification_key: "codex",
        marketplace_test_observations: [],
        disclosure:
          `Qualification is pending; Stewards catalog admission and marketplace registration for ${version} are not evidenced.`,
      },
    ]);
    expect(qualification.claude.result).toBe("pending");
    expect(qualification.codex.result).toBe("pending");
    expect(qualification.node_versions["24"].result).toBe("pending");
    expect(qualification.dashboard.result).toBe("pending");
    expect(qualification.result).toBe("pending");
    const pluginRoot = await realpath(plugin);
    for (const row of surfaces.rows) {
      const qualificationFile = join(plugin, row.qualification_path);
      const qualificationStat = await lstat(qualificationFile);
      expect(qualificationStat.isFile()).toBe(true);
      expect(qualificationStat.isSymbolicLink()).toBe(false);
      const resolved = await realpath(qualificationFile);
      expect(relative(pluginRoot, resolved)).not.toMatch(/^\.\.(?:\/|$)/u);
    }

    const observationPath = "test-results/codex-marketplace.json";
    const observation = {
      schema_version: 1,
      host: "codex",
      surface_id: "codex-cli-local-session",
      marketplace: {
        name: "kodhama",
        repository: "kodhama/stewards",
        revision: "a".repeat(40),
      },
      execution: {
        repository: "kodhama/wisp",
        commit: "b".repeat(40),
        workflow: ".github/workflows/ci.yml",
        job: "codex-marketplace",
        run_id: 123,
        run_attempt: 1,
        setup_step_id: "stewards_marketplace_kodhama_codex",
      },
      observed_at: "2026-07-25T00:00:00.000Z",
    };
    const withObservation = structuredClone(surfaces);
    withObservation.rows[1].marketplace_test_observations = [observationPath];
    withObservation.rows[1].disclosure = `${withObservation.rows[1].disclosure} ${UNVERIFIED_SUFFIX}`;
    expect(validSurfaces(
      withObservation,
      version,
      qualification,
      { [observationPath]: observation },
    )).toBe(true);

    for (const result of ["pending", "pass", "fail"] as const) {
      for (const hasObservation of [false, true]) {
        const transitionedQualification = structuredClone(qualification);
        transitionedQualification.codex.result = result;
        const transitionedSurfaces = structuredClone(surfaces);
        const codexRow = transitionedSurfaces.rows[1];
        codexRow.marketplace_test_observations = hasObservation ? [observationPath] : [];
        const resultPrefix = result === "pending"
          ? "Qualification is pending;"
          : result === "pass"
          ? "Qualification passed;"
          : "Qualification failed;";
        codexRow.disclosure = `${resultPrefix} ${CATALOG_NON_EVIDENCE(version)}${
          hasObservation ? ` ${UNVERIFIED_SUFFIX}` : ""
        }`;
        expect(
          validSurfaces(
            transitionedSurfaces,
            version,
            transitionedQualification,
            hasObservation ? { [observationPath]: observation } : {},
          ),
          `${result}/${hasObservation ? "observation" : "no-observation"}`,
        ).toBe(true);
        codexRow.disclosure = `${codexRow.disclosure} `;
        expect(validSurfaces(
          transitionedSurfaces,
          version,
          transitionedQualification,
          hasObservation ? { [observationPath]: observation } : {},
        )).toBe(false);
      }
    }

    const invalidMutations: unknown[] = [];
    const absentArray = structuredClone(surfaces);
    delete absentArray.rows[0].marketplace_test_observations;
    invalidMutations.push(absentArray);
    const escapingPath = structuredClone(withObservation);
    escapingPath.rows[1].marketplace_test_observations = ["../observation.json"];
    invalidMutations.push(escapingPath);
    const unknownProperty = structuredClone(surfaces);
    unknownProperty.rows[0].unknown = true;
    invalidMutations.push(unknownProperty);
    const missingDisclosure = structuredClone(withObservation);
    missingDisclosure.rows[1].disclosure = "Qualification is pending.";
    invalidMutations.push(missingDisclosure);
    for (const mutation of invalidMutations) {
      expect(validSurfaces(
        mutation,
        version,
        qualification,
        { [observationPath]: observation },
      )).toBe(false);
    }
    expect(validSurfaces(
      withObservation,
      version,
      qualification,
      { [observationPath]: { ...observation, unknown: true } },
    )).toBe(false);
    expect(validSurfaces(
      withObservation,
      version,
      qualification,
      { [observationPath]: { ...observation, host: "claude" } },
    )).toBe(false);
    expect(validSurfaces(
      withObservation,
      version,
      qualification,
      { [observationPath]: { ...observation, surface_id: "claude-interactive" } },
    )).toBe(false);

    const readme = await readFile(join(plugin, "README.md"), "utf8");
    expect(readme).toContain("VERSION");
    expect(readme).toContain("surfaces.json");
    expect(readme).not.toMatch(/Install the Wisp entry from the Kodhama Stewards marketplace/iu);
  });

  it("keeps npm plugin validation repo-portable", async () => {
    const packageJson = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8"));
    expect(packageJson.scripts["validate:plugin"]).toBe("vitest run test/wisp-plugin-v5.test.ts");
    expect(packageJson.scripts["validate:plugin"]).not.toMatch(/\/Users\/|CODEX_HOME|\.codex/);
  });
});
