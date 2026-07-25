import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import {
  assertCapabilityAbsent,
  directoryIsAbsentOrEmpty,
  runSanitizedCommand,
} from "./capability-safety.mjs";

const STAGES = [
  "pre-dashboard",
  "dashboard-call",
  "browser-launch",
  "navigation",
  "dom",
  "authorization",
  "cleanup",
  "redaction",
];
const FAILURES = ["assertion", "timeout", "crash", "signal", "cleanup"];
const CAPABILITY = "C".repeat(43);

export function failureCasePassed(stage, failure, result, outputEmpty) {
  if (!outputEmpty) return false;
  if (stage === "redaction") {
    return result.safetyFailed === true &&
      result.controlStages?.includes(`${stage}:${failure}`) === true &&
      result.controlFailures?.includes(`${stage}:${failure}`) === true;
  }
  return result.safetyFailed === false &&
    !(result.status === 0 && result.signal === null) &&
    result.controlStages?.includes(`${stage}:${failure}`) === true &&
    result.controlFailures?.includes(`${stage}:${failure}`) === true;
}

export async function runCapabilityFailureCampaign(artifactGuard) {
  for (const stage of STAGES) {
    for (const failure of FAILURES) {
      const nonce = randomUUID();
      const output = resolve(
        "test-results/playwright-failures",
        `${stage}-${failure}`,
      );
      await rm(output, { recursive: true, force: true });
      const result = await runSanitizedCommand(
        process.execPath,
        [
          "node_modules/@playwright/test/cli.js",
          "test",
          "--config",
          "test/e2e/fixtures/playwright-browser-failure.config.ts",
        ],
        {
          emit: false,
          controlNonce: nonce,
          redactStandaloneCapabilities: true,
          timeoutMs: 15_000,
          env: {
            ...process.env,
            NODE_OPTIONS: `--require=${JSON.stringify(artifactGuard)}`,
            PLAYWRIGHT_LAST_RUN_OUTPUT_FILE: "/dev/null",
            PLAYWRIGHT_NO_COPY_PROMPT: "1",
            WISP_E2E_CONTROL_NONCE: nonce,
            WISP_FAILURE_CAPABILITY: CAPABILITY,
            WISP_FAILURE_KIND: failure,
            WISP_FAILURE_STAGE: stage,
            WISP_PLAYWRIGHT_OUTPUT_DIR: output,
          },
        },
      );
      const outputEmpty = await directoryIsAbsentOrEmpty(output);
      if (!failureCasePassed(stage, failure, result, outputEmpty)) return false;
      if (stage === "redaction") continue;
      try {
        assertCapabilityAbsent(
          Buffer.concat([
            result.stdout ?? Buffer.alloc(0),
            result.stderr ?? Buffer.alloc(0),
          ]),
          [CAPABILITY],
        );
      } catch {
        return false;
      }
    }
  }
  return true;
}
