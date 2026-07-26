// SPEC-0002@v8: S1-S6, S13-S17 / R1-R6, R15-R20.
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function text(path: string): Promise<string> {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("SPEC-0002@v8 reproducible Codex E2E and Preview smoke surfaces", () => {
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
        'specs = ["spec-0001-plugin-mcp-distribution@v12"]',
        "decisions = []",
        "",
        "[packages.e2e]",
        'paths = ["test/e2e/**"]',
        'specs = ["spec-0001-plugin-mcp-distribution@v12", "spec-0002-codex-e2e-testing@v8"]',
        'decisions = ["adr-0006-codex-e2e-testing", "adr-0007-codex-canary-evidence", "adr-0011-node-24-only-support"]',
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

  it("defines one explicit Node 24 fast gate, isolated browser gate, and only the two canary triggers", async () => {
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

    const canary = await text(".github/workflows/codex-canary.yml");
    expect(canary).toMatch(/^on:\n  schedule:/mu);
    expect(canary).toContain("workflow_dispatch:");
    expect(canary).not.toMatch(/\n\s+(?:push|pull_request):/u);
    for (const input of ["marketplace_source", "marketplace_ref"]) {
      expect(canary).toMatch(new RegExp(`${input}:[\\s\\S]{0,120}required: true`, "u"));
    }
    expect(canary).not.toMatch(
      /candidate_version|candidate_bundle_sha256|bundle_sha256|CANARY_VERSION|CANARY_SHA256|verify-codex-canary/u,
    );
    const jobPreamble = canary.slice(canary.indexOf("jobs:"), canary.indexOf("    steps:"));
    expect(jobPreamble).not.toMatch(/CODEX_API_KEY|OPENAI_API_KEY/u);
    expect(canary).toContain("CANARY_CODEX_API_KEY: ${{ secrets.CODEX_API_KEY }}");
    expect(canary).not.toContain("OPENAI_API_KEY");
    expect(canary).toContain("id: install_codex");
    expect(canary).toMatch(/id: install_codex[\s\S]{0,120}continue-on-error: true/u);
    expect(canary).toContain("CODEX_INSTALL_OUTCOME: ${{ steps.install_codex.outcome }}");
    expect(canary).toContain("timeout-minutes: 20");
    const nodePreflight = "node scripts/node24-preflight.mjs";
    const escapedNodePreflight = nodePreflight.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    expect(canary.match(/\bnode --version\b/gu)).toHaveLength(1);
    expect(canary.match(new RegExp(escapedNodePreflight, "gu"))).toHaveLength(1);
    expect(canary.indexOf("node --version")).toBeLessThan(canary.indexOf(nodePreflight));
    expect(canary.indexOf(nodePreflight)).toBeLessThan(canary.indexOf("id: install_codex"));
    expect(canary.indexOf(nodePreflight)).toBeLessThan(canary.indexOf("Run weekly canary"));
    expect(canary.indexOf(nodePreflight)).toBeLessThan(canary.indexOf("Run manual Preview smoke"));
    const canaryJobPreamble = canary.slice(
      canary.indexOf("jobs:"),
      canary.indexOf("    steps:"),
    );
    expect(canaryJobPreamble).not.toContain("runner.temp");
    expect(canary.match(/CODEX_HOME: \$\{\{ runner\.temp \}\}/gu)).toHaveLength(2);
    expect(canary.match(/EVIDENCE_DIR: \$\{\{ runner\.temp \}\}/gu)).toHaveLength(3);
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
    expect(canaryDriver).not.toContain("bundleSha256");
    expect(canaryDriver).not.toContain('"unavailable"');
    expect(canaryDriver).toContain("writeSafeCanaryArtifacts");
    expect(canaryDriver).not.toContain(
      "await writeFile(transcriptPath, execution.stdout",
    );

    expect(canary).toContain(
      "steps.weekly.outputs.artifact_ready == 'true'",
    );
    expect(canary).toContain(
      "steps.manual.outputs.artifact_ready == 'true'",
    );
    expect(canary).toContain(
      "steps.manual.outcome == 'failure'",
    );
    expect(canary).not.toMatch(
      /name: Upload private canary evidence[\s\S]{0,100}if: always\(\)\s*$/mu,
    );
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
