// SPEC-0002@v9: S1-S5, S13-S15, S17 / R1-R4, R15-R18, R20.
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function text(path: string): Promise<string> {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("SPEC-0002@v9 reproducible Codex E2E surfaces", () => {
  it("pins Playwright and exposes one direct and one container entrypoint", async () => {
    const packageJson = JSON.parse(await text("package.json"));
    expect(packageJson.devDependencies["@playwright/test"]).toBe("1.61.0");
    expect(packageJson.scripts["test:e2e"]).toBe(
      "npm run build && node scripts/run-capability-safe-playwright.mjs",
    );
    expect(packageJson.scripts["test:e2e:container"]).toBe(
      "node scripts/run-e2e-container.mjs",
    );
    expect(packageJson.scripts["test:e2e:node24"]).toBe(
      "node scripts/node24-preflight.mjs && npm run test:e2e",
    );
  });

  it("pins the official browser image and runs the copied Preview package unprivileged", async () => {
    const dockerfile = await text("test/e2e/Dockerfile");
    expect(dockerfile).toContain(
      "FROM mcr.microsoft.com/playwright:v1.61.0-noble@sha256:57b65fdc9ceabe0ef613124c7bbe2babcf9362c4d85e382fe3b03604e84b428a",
    );
    expect(dockerfile).toMatch(/^USER pwuser$/mu);
    expect(dockerfile).toContain("RUN chown pwuser:pwuser /work");
    expect(dockerfile).toContain('CMD ["npm", "run", "test:e2e:node24"]');

    const driver = await text("scripts/run-e2e-container.mjs");
    expect(driver).toContain('"--network"');
    expect(driver).toContain('"none"');
    expect(driver).toContain('"--init"');
    expect(driver).toContain('"--tmpfs"');
    expect(driver).toContain("mode=700,uid=1001,gid=1001");
    expect(driver).not.toContain("uid=1000");
    expect(driver).not.toMatch(/--volume|-v\b|CODEX_API_KEY|OPENAI_API_KEY/u);

    const dockerignore = await text(".dockerignore");
    expect(dockerignore).toMatch(/^\*$/mu);
    for (const excluded of [".git", "node_modules", "test-results", "playwright-report"]) {
      expect(dockerignore).toContain(excluded);
    }
    for (const included of [
      "!package.json",
      "!package-lock.json",
      "!src/dashboard.ts",
      "!src/entry.ts",
      "!src/mcp.ts",
      "!src/process-identity.ts",
      "!src/project.ts",
      "!src/runtime.ts",
      "!plugins/wisp/.claude-plugin/plugin.json",
      "!plugins/wisp/.codex-plugin/plugin.json",
      "!plugins/wisp/.mcp.json",
      "!plugins/wisp/README.md",
      "!plugins/wisp/VERSION",
      "!plugins/wisp/dist/wisp.mjs",
      "!plugins/wisp/skills/dashboard/SKILL.md",
      "!plugins/wisp/skills/wisp/SKILL.md",
      "!scripts/build-plugin.mjs",
      "!scripts/capability-safety.mjs",
      "!scripts/node24-preflight.mjs",
      "!scripts/node-support.mjs",
      "!scripts/playwright-artifact-guard.cjs",
      "!scripts/run-capability-failure-campaign.mjs",
      "!scripts/run-capability-safe-playwright.mjs",
      "!test/e2e/codex-plugin.e2e.ts",
      "!test/e2e/fixtures/playwright-browser-failure.config.ts",
      "!test/e2e/fixtures/playwright-browser-failure.fixture.ts",
      "!test/e2e/playwright.config.ts",
    ]) {
      expect(dockerignore).toContain(included);
    }
    expect(dockerignore).not.toContain("!src/**");
    expect(dockerignore).not.toContain("!plugins/wisp/**");
  });

  it("keeps the browser suite deterministic with raw artifact writers disabled", async () => {
    const config = await text("test/e2e/playwright.config.ts");
    expect(config).toMatch(/projects:\s*\[\s*\{\s*name:\s*"chromium"/u);
    expect(config).toContain("workers: 1");
    expect(config).toContain("retries: 0");
    expect(config).toContain('trace: "off"');
    expect(config).toContain('video: "off"');
    expect(config).toContain('screenshot: "off"');
    expect(config).toContain('reporter: [["line"]]');
    expect(config).toContain('outputDir: resolve("test-results/playwright")');
    expect(config).not.toMatch(/html|json|junit|blob|attachment|retain-on-failure/u);

    const wrapper = await text("scripts/run-capability-safe-playwright.mjs");
    expect(wrapper).toContain("runSanitizedCommand");
    expect(wrapper).toContain("test-results/playwright");
    expect(wrapper).toContain("browser-evidence.json");
    expect(wrapper).toContain("playwright-artifact-guard.cjs");
    expect(wrapper).toContain("runCapabilityFailureCampaign");
    expect(wrapper).toContain("PLAYWRIGHT_LAST_RUN_OUTPUT_FILE");
    expect(wrapper).toContain("PLAYWRIGHT_NO_COPY_PROMPT");
    expect(wrapper).toContain("controlNonce");
    expect(wrapper).toContain("emit: false");

    const container = await text("scripts/run-e2e-container.mjs");
    expect(container).toContain("runSanitizedCommand");
    expect(container).not.toContain('stdio: "inherit"');
  });

  it("records the exact unit and e2e dependency graph and Grove token", async () => {
    expect(await text("test/test-deps.toml")).toBe(
      [
        "schema = 1",
        "",
        "[packages.unit]",
        'paths = ["test/*.test.ts"]',
        'specs = ["spec-0001-plugin-mcp-distribution@v16"]',
        "decisions = []",
        "",
        "[packages.e2e]",
        'paths = ["test/e2e/**"]',
        'specs = ["spec-0001-plugin-mcp-distribution@v16", "spec-0002-codex-e2e-testing@v9"]',
        'decisions = ["adr-0006-codex-e2e-testing", "adr-0011-node-24-only-support"]',
        "",
      ].join("\n"),
    );
    expect(await text(".grove/config.toml")).toContain(
      'TEST_DEPS_LEDGER = "test/test-deps.toml"',
    );
  });

  it("defines the exact DOM evidence hooks without HTML injection", async () => {
    const dashboard = await text("src/dashboard.ts");
    for (const hook of [
      '"data-wisp-view",name',
      'section("Runs and agents","lifecycle")',
      'section("Timeline","timeline")',
      'section("Commands","commands")',
      'section("Parse errors","parse-errors")',
      '"data-event-index"',
      '"data-command-id"',
      '"data-line"',
      '"data-field"',
    ]) {
      expect(dashboard).toContain(hook);
    }
    expect(dashboard).not.toContain("innerHTML");
  });

  it("defines one explicit Node 24 fast gate, an isolated browser gate, and a keyless host gate", async () => {
    const ci = await text(".github/workflows/ci.yml");
    expect(ci).toMatch(/fast:[\s\S]*node-version:\s*24/u);
    expect(ci).not.toMatch(/\bmatrix\b|node-version:\s*(?:20|22)\b/u);
    for (const command of [
      "npm run typecheck",
      "npm test",
      "npm run build",
      "npm run validate:plugin",
    ]) {
      const escaped = command.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      expect(ci.match(new RegExp(escaped, "gu"))).toHaveLength(1);
    }
    expect(ci).toMatch(/codex-e2e:[\s\S]*needs:\s*fast/u);
    expect(ci.match(/npm run test:e2e:container/gu)).toHaveLength(1);
  });

  it("ignores browser artifacts and cleans its fixture root", async () => {
    const ignore = await text(".gitignore");
    expect(ignore).toContain("test-results/");
    expect(ignore).toContain("playwright-report/");
    const e2e = await text("test/e2e/codex-plugin.e2e.ts");
    expect(e2e).toContain("rm(root, { recursive: true, force: true })");
    expect(e2e).toContain("assertRequestsStayOnOrigin()");
  });
});
