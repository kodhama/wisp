// SPEC-0002 v3: S1-S9 / R1-R11.
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function text(path: string): Promise<string> {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("SPEC-0002 v3 reproducible Codex E2E surfaces", () => {
  it("pins Playwright and exposes one direct and one container entrypoint", async () => {
    const packageJson = JSON.parse(await text("package.json"));
    expect(packageJson.devDependencies["@playwright/test"]).toBe("1.61.0");
    expect(packageJson.scripts["test:e2e"]).toBe(
      "npm run build && playwright test --config test/e2e/playwright.config.ts",
    );
    expect(packageJson.scripts["test:e2e:container"]).toBe(
      "node scripts/run-e2e-container.mjs",
    );
  });

  it("pins the official browser image and runs the copied candidate unprivileged", async () => {
    const dockerfile = await text("test/e2e/Dockerfile");
    expect(dockerfile).toContain(
      "FROM mcr.microsoft.com/playwright:v1.61.0-noble@sha256:57b65fdc9ceabe0ef613124c7bbe2babcf9362c4d85e382fe3b03604e84b428a",
    );
    expect(dockerfile).toMatch(/^USER pwuser$/mu);
    expect(dockerfile).toContain("RUN chown pwuser:pwuser /work");
    expect(dockerfile).toContain('CMD ["npm", "run", "test:e2e"]');

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
      "!plugins/wisp/dist/wisp.mjs",
      "!plugins/wisp/qualification.json",
      "!plugins/wisp/skills/dashboard/SKILL.md",
      "!plugins/wisp/skills/wisp/SKILL.md",
      "!scripts/build-plugin.mjs",
      "!test/e2e/codex-plugin.e2e.ts",
      "!test/e2e/playwright.config.ts",
    ]) {
      expect(dockerignore).toContain(included);
    }
    expect(dockerignore).not.toContain("!src/**");
    expect(dockerignore).not.toContain("!plugins/wisp/**");
  });

  it("keeps the browser suite deterministic and failure-diagnostic", async () => {
    const config = await text("test/e2e/playwright.config.ts");
    expect(config).toMatch(/projects:\s*\[\s*\{\s*name:\s*"chromium"/u);
    expect(config).toContain("workers: 1");
    expect(config).toContain("retries: 0");
    expect(config).toContain('trace: "retain-on-failure"');
    expect(config).toContain('screenshot: "only-on-failure"');
  });

  it("records the exact unit and e2e dependency graph and Grove token", async () => {
    expect(await text("test/test-deps.toml")).toBe(
      [
        "schema = 1",
        "",
        "[packages.unit]",
        'paths = ["test/*.test.ts"]',
        'specs = ["spec-0001-plugin-mcp-distribution@v7"]',
        "decisions = []",
        "",
        "[packages.e2e]",
        'paths = ["test/e2e/**"]',
        'specs = ["spec-0001-plugin-mcp-distribution@v7", "spec-0002-codex-e2e-testing@v3"]',
        'decisions = ["adr-0006-codex-e2e-testing", "adr-0007-codex-canary-evidence"]',
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

  it("defines the matrix gate, isolated browser gate, and only the two canary triggers", async () => {
    const ci = await text(".github/workflows/ci.yml");
    expect(ci).toMatch(/node-version:\s*\[20,\s*22,\s*24\]/u);
    expect(ci).toContain("npm run typecheck");
    expect(ci).toContain("npm test");
    expect(ci).toContain("npm run build");
    expect(ci).toContain("npm run validate:plugin");
    expect(ci).toMatch(/codex-e2e:[\s\S]*needs:\s*node/u);
    expect(ci).toContain("npm run test:e2e:container");

    const canary = await text(".github/workflows/codex-canary.yml");
    expect(canary).toMatch(/^on:\n  schedule:/mu);
    expect(canary).toContain("workflow_dispatch:");
    expect(canary).not.toMatch(/\n\s+(?:push|pull_request):/u);
    for (const input of [
      "candidate_version",
      "candidate_bundle_sha256",
      "candidate_marketplace_source",
      "candidate_marketplace_ref",
    ]) {
      expect(canary).toMatch(new RegExp(`${input}:[\\s\\S]{0,120}required: true`, "u"));
    }
    const jobPreamble = canary.slice(canary.indexOf("jobs:"), canary.indexOf("    steps:"));
    expect(jobPreamble).not.toMatch(/CODEX_API_KEY|OPENAI_API_KEY/u);
    expect(canary).toContain("CANARY_CODEX_API_KEY: ${{ secrets.CODEX_API_KEY }}");
    expect(canary).not.toContain("OPENAI_API_KEY");
    expect(canary).toContain("id: install_codex");
    expect(canary).toMatch(/id: install_codex[\s\S]{0,120}continue-on-error: true/u);
    expect(canary).toContain("CODEX_INSTALL_OUTCOME: ${{ steps.install_codex.outcome }}");
    expect(canary).toContain("timeout-minutes: 20");
    const runBlocks = [...canary.matchAll(/\n\s+run:\s*>-([\s\S]*?)(?=\n\s+- name:|\n\s+- uses:|$)/gu)]
      .map((match) => match[1] ?? "");
    expect(runBlocks.join("\n")).not.toContain("${{ inputs.");

    const canaryDriver = await text("scripts/codex-canary.mjs");
    expect(canaryDriver).toContain('approval_policy="on-request"');
    expect(canaryDriver).toContain('approvals_reviewer="auto_review"');
    expect(canaryDriver).not.toMatch(/dangerously-bypass|approval_policy="never"/u);
    expect(canaryDriver).toMatch(/timeoutMs/u);
    expect(canaryDriver).toContain("execTimedOut");
    expect(canaryDriver).toContain("invalid GitHub workflow context");
    expect(canaryDriver).toContain("commandEnvironments");
    expect(canaryDriver).toMatch(
      /runCommand\("codex", \["--version"\],[\s\S]{0,120}env: baseEnv/u,
    );
    expect(canaryDriver).toMatch(
      /"plugin", "marketplace", "add"[\s\S]{0,300}env: baseEnv/u,
    );
    expect(canaryDriver).toMatch(
      /\["plugin", "add", "wisp@kodhama", "--json"\][\s\S]{0,120}env: baseEnv/u,
    );
    expect(canaryDriver).toMatch(
      /buildCodexExecArgs\(fixture, prompt\)[\s\S]{0,160}env: execEnv/u,
    );
    expect(canaryDriver).toContain("let codexVersion = null");
    expect(canaryDriver).toContain("let pluginVersion = null");
    expect(canaryDriver).toContain("let bundleSha256 = null");
    expect(canaryDriver).not.toContain('"unavailable"');
  });

  it("ignores browser artifacts and cleans its fixture root", async () => {
    const ignore = await text(".gitignore");
    expect(ignore).toContain("test-results/");
    expect(ignore).toContain("playwright-report/");
    const e2e = await text("test/e2e/codex-plugin.e2e.ts");
    expect(e2e).toContain("await rm(root, { recursive: true, force: true })");
    expect(e2e).toContain("assertRequestsStayOnOrigin()");
  });
});
