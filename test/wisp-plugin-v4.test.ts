// SPEC-0001 v4: S2, S20, S23, S28 / R1-R3, R24-R26, R34.
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

describe("SPEC-0001 S20/S23/S28 — exact dual-host MCP-only payload", () => {
  it("contains exactly the seven release files", async () => {
    expect(await inventory()).toEqual([
      ".claude-plugin/plugin.json",
      ".codex-plugin/plugin.json",
      ".mcp.json",
      "README.md",
      "dist/wisp.mjs",
      "qualification.json",
      "skills/wisp/SKILL.md",
    ]);
  });

  it("has equal versions and exact host launch definitions with no CLI/bin", async () => {
    const claude = JSON.parse(await readFile(join(plugin, ".claude-plugin/plugin.json"), "utf8"));
    const codex = JSON.parse(await readFile(join(plugin, ".codex-plugin/plugin.json"), "utf8"));
    const claudeMcp = JSON.parse(await readFile(join(plugin, ".mcp.json"), "utf8"));
    expect(claude.version).toBe("0.1.0");
    expect(codex.version).toBe(claude.version);
    expect(claude.bin).toBeUndefined();
    expect(codex.bin).toBeUndefined();
    expect(codex.mcpServers).toEqual({
      wisp: { command: "node", args: ["./dist/wisp.mjs"], cwd: "." },
    });
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

  it("keeps the skill portable and qualification pending with the real bundle digest", async () => {
    const skill = await readFile(join(plugin, "skills/wisp/SKILL.md"), "utf8");
    expect(skill).toContain("wisp_status");
    expect(skill).toContain("wisp_check");
    expect(skill).not.toMatch(/Grove|grove|\/|node |npm |npx |shell|auto.?obey/i);

    const bundle = await readFile(join(plugin, "dist/wisp.mjs"));
    const qualification = JSON.parse(await readFile(join(plugin, "qualification.json"), "utf8"));
    expect(qualification.artifact_sha256).toBe(createHash("sha256").update(bundle).digest("hex"));
    expect(qualification).toMatchObject({
      plugin_version: "0.1.0",
      node_versions: {
        "20": { version: "pending", result: "pending" },
        "22": { version: "pending", result: "pending" },
        "24": { version: "pending", result: "pending" },
      },
      claude: { version: "pending", result: "pending" },
      codex: { version: "pending", result: "pending" },
      result: "pending",
    });
  });

  it("keeps npm plugin validation repo-portable", async () => {
    const packageJson = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8"));
    expect(packageJson.scripts["validate:plugin"]).toBe("vitest run test/wisp-plugin-v4.test.ts");
    expect(packageJson.scripts["validate:plugin"]).not.toMatch(/\/Users\/|CODEX_HOME|\.codex/);
  });
});
