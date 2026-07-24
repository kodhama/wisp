// SPEC-0001 v6: S2, S20, S23, S28 / R1-R3, R24-R26, R34, R37, R55, R57.
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const plugin = join(process.cwd(), "plugins/wisp");

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

describe("SPEC-0001 v6 S20/S23/S28 — exact dual-host MCP-only payload", () => {
  it("contains exactly the eight release files", async () => {
    expect(await inventory()).toEqual([
      ".claude-plugin/plugin.json",
      ".codex-plugin/plugin.json",
      ".mcp.json",
      "README.md",
      "dist/wisp.mjs",
      "qualification.json",
      "skills/dashboard/SKILL.md",
      "skills/wisp/SKILL.md",
    ]);
  });

  it("has equal versions and exact host launch definitions with no CLI/bin", async () => {
    const claude = JSON.parse(await readFile(join(plugin, ".claude-plugin/plugin.json"), "utf8"));
    const codex = JSON.parse(await readFile(join(plugin, ".codex-plugin/plugin.json"), "utf8"));
    const claudeMcp = JSON.parse(await readFile(join(plugin, ".mcp.json"), "utf8"));
    expect(claude.version).toBe("0.2.1-rc.1");
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
      "'plugins','cache','kodhama','wisp','0.2.1-rc.1','dist','wisp.mjs'",
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
    expect(qualification.plugin_version).toBe("0.2.1-rc.1");
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
    expect(Object.keys(qualification.node_versions).sort()).toEqual(["20", "22", "24"]);
    for (const major of ["20", "22", "24"] as const) {
      const evidence = qualification.node_versions[major];
      expect(Object.keys(evidence).sort()).toEqual(["result", "version"]);
      expect(evidence.version).toMatch(new RegExp(`^(?:pending|${major}\\.\\d+\\.\\d+)$`, "u"));
      expect(["pending", "pass", "fail"]).toContain(evidence.result);
      if (evidence.result === "pass") expect(evidence.version).not.toBe("pending");
    }
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
      ]).toEqual(["pass", "pass", "pass", "pass", "pass", "pass"]);
    }
  });

  it("keeps npm plugin validation repo-portable", async () => {
    const packageJson = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8"));
    expect(packageJson.scripts["validate:plugin"]).toBe("vitest run test/wisp-plugin-v5.test.ts");
    expect(packageJson.scripts["validate:plugin"]).not.toMatch(/\/Users\/|CODEX_HOME|\.codex/);
  });
});
