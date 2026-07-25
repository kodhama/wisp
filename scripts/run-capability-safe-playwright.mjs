#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { access, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import {
  CAPABILITY_REDACTION_ERROR,
  assertCapabilityAbsent,
  directoryIsAbsentOrEmpty,
  runSanitizedCommand,
  validateBrowserEvidence,
} from "./capability-safety.mjs";
import { runCapabilityFailureCampaign } from "./run-capability-failure-campaign.mjs";

const playwrightOutput = resolve("test-results/playwright");
const browserEvidence = resolve("test-results/browser-evidence.json");
const artifactGuard = resolve("scripts/playwright-artifact-guard.cjs");
const controlNonce = randomUUID();
await rm(playwrightOutput, { recursive: true, force: true });
await rm(browserEvidence, { force: true });

const result = await runSanitizedCommand(
  process.execPath,
  [
    "node_modules/@playwright/test/cli.js",
    "test",
    "--config",
    "test/e2e/playwright.config.ts",
  ],
  {
    emit: false,
    controlNonce,
    redactStandaloneCapabilities: true,
    env: {
      ...process.env,
      NODE_OPTIONS: [
        process.env.NODE_OPTIONS,
        `--require=${JSON.stringify(artifactGuard)}`,
      ].filter(Boolean).join(" "),
      PLAYWRIGHT_LAST_RUN_OUTPUT_FILE: "/dev/null",
      PLAYWRIGHT_NO_COPY_PROMPT: "1",
      WISP_E2E_CONTROL_NONCE: controlNonce,
      WISP_PLAYWRIGHT_OUTPUT_DIR: playwrightOutput,
    },
  },
);

let safe = !result.safetyFailed &&
  await directoryIsAbsentOrEmpty(playwrightOutput);
if (result.status === 0) {
  safe &&= await access(browserEvidence).then(() => true).catch(() => false);
  if (safe) {
    safe = await readFile(browserEvidence)
      .then((bytes) => {
        assertCapabilityAbsent(bytes);
        validateBrowserEvidence(JSON.parse(bytes.toString("utf8")));
        return true;
      })
      .catch(() => false);
  }
  if (safe) safe = await runCapabilityFailureCampaign(artifactGuard);
}
if (!safe) {
  await rm(browserEvidence, { force: true });
  process.stderr.write(CAPABILITY_REDACTION_ERROR);
  process.exitCode = 1;
} else {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.status ?? 1;
}
