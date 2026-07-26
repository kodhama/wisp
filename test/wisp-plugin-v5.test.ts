// SPEC-0001@v13 S20/S23/S25/S28/S65-S69 / R24-R30/R34/R37/R55/R73-R77.
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const plugin = join(root, "plugins/wisp");

function validSemver(value: string): boolean {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u
      .exec(value);
  return match !== null && (match[4] === undefined ||
    match[4].split(".").every((identifier) =>
      !/^\d+$/u.test(identifier) || identifier === "0" ||
      !identifier.startsWith("0")));
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

async function sourceFiles(): Promise<string[]> {
  const files: string[] = [];
  async function visit(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if ([".git", "node_modules", "decisions", "specs"].includes(entry.name)) {
        continue;
      }
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (![
        "test/wisp-plugin-v5.test.ts",
        "test/e2e/codex-e2e-strategy-v2.unit.test.ts",
      ].includes(relative(root, full))) files.push(full);
    }
  }
  await visit(root);
  return files;
}

describe("SPEC-0001@v13 Preview dual-host MCP-only payload", () => {
  it("contains exactly the eight distributed paths and no retired metadata", async () => {
    expect(await inventory()).toEqual([
      ".claude-plugin/plugin.json",
      ".codex-plugin/plugin.json",
      ".mcp.json",
      "README.md",
      "VERSION",
      "dist/wisp.mjs",
      "skills/dashboard/SKILL.md",
      "skills/wisp/SKILL.md",
    ]);
  });

  it("keeps every retained package carrier at canonical 0.2.1-rc.4", async () => {
    const versionBytes = await readFile(join(plugin, "VERSION"), "utf8");
    expect(versionBytes).toBe("0.2.1-rc.4\n");
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
    const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    const packageLock = JSON.parse(await readFile(join(root, "package-lock.json"), "utf8"));
    const source = await readFile(join(root, "src/mcp.ts"), "utf8");
    const bundle = await readFile(join(plugin, "dist/wisp.mjs"), "utf8");
    expect([
      claude.version,
      codex.version,
      packageJson.version,
      packageLock.version,
      packageLock.packages[""].version,
    ]).toEqual(Array(5).fill(version));
    expect(source).toContain(`{ name: "wisp", version: "${version}" }`);
    expect(bundle).toContain(`{ name: "wisp", version: "${version}" }`);
  });

  it("has exact host launch definitions, Node 24 target, and no CLI", async () => {
    const version = (await readFile(join(plugin, "VERSION"), "utf8")).trimEnd();
    const claude = JSON.parse(await readFile(join(plugin, ".claude-plugin/plugin.json"), "utf8"));
    const codex = JSON.parse(await readFile(join(plugin, ".codex-plugin/plugin.json"), "utf8"));
    const claudeMcp = JSON.parse(await readFile(join(plugin, ".mcp.json"), "utf8"));
    expect(claude.bin).toBeUndefined();
    expect(codex.bin).toBeUndefined();
    expect(codex.mcpServers.wisp).toEqual({
      command: "node",
      args: ["-e", expect.any(String)],
      env_vars: ["CODEX_HOME"],
    });
    const bootstrap = codex.mcpServers.wisp.args[1];
    expect(bootstrap).toContain("process.env.WISP_PROJECT_ROOT=process.cwd()");
    expect(bootstrap).toContain(
      `'plugins','cache','kodhama','wisp','${version}','dist','wisp.mjs'`,
    );
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
    const build = await readFile(join(root, "scripts/build-plugin.mjs"), "utf8");
    expect(build).toContain('import { ESBUILD_NODE_TARGET } from "./node-support.mjs";');
    expect(build).toMatch(/\btarget:\s*ESBUILD_NODE_TARGET/u);
  });

  it("keeps both skills portable and documents Preview without support inference", async () => {
    const lifecycle = await readFile(join(plugin, "skills/wisp/SKILL.md"), "utf8");
    expect(lifecycle).toContain("wisp_status");
    expect(lifecycle).toContain("wisp_check");
    expect(lifecycle).not.toMatch(/Grove|grove|node |npm |npx |shell|auto.?obey/i);

    const dashboard = await readFile(join(plugin, "skills/dashboard/SKILL.md"), "utf8");
    expect(dashboard).toContain("wisp_dashboard");
    expect(dashboard).toMatch(/open|show|start/i);
    expect(dashboard).toMatch(/exact|returned/i);
    expect(dashboard).not.toMatch(
      /https?:\/\/|```|child_process|\.grove\/|(?:^|\n)\s*(?:node|npm|npx|open|xdg-open)\s/imu,
    );

    const readme = await readFile(join(plugin, "README.md"), "utf8");
    expect(readme).toMatch(/\bPreview\b/u);
    expect(readme).toMatch(/support is not claimed/iu);
    expect(readme).toMatch(/marketplace presence[\s\S]*does not/iu);
    expect(readme).toMatch(/future Supported claim[\s\S]*Wisp-local decision/iu);
  });

  it("has no implementation, test, build, workflow, or documentation consumer of retired metadata", async () => {
    const offenders: string[] = [];
    for (const path of await sourceFiles()) {
      const body = await readFile(path, "utf8").catch(() => "");
      if (/qualification\.json|surfaces\.json|verify-codex-canary/u.test(body)) {
        offenders.push(relative(root, path));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps npm plugin validation repository-portable", async () => {
    const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    expect(packageJson.scripts["validate:plugin"]).toBe(
      "vitest run test/wisp-plugin-v5.test.ts",
    );
    expect(packageJson.scripts["validate:plugin"]).not.toMatch(
      /\/Users\/|CODEX_HOME|\.codex/u,
    );
  });
});
