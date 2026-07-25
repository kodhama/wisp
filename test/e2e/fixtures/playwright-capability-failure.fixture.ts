import { test } from "@playwright/test";

test("capability-bearing reporter failure", () => {
  const capability = process.env.WISP_FAILURE_CAPABILITY;
  const nonce = process.env.WISP_E2E_CONTROL_NONCE;
  process.stdout.write(
    `\x1eWISP_CAPABILITY:${nonce}:${capability}\x1f`,
  );
  throw new Error(`reporter-input=${capability}`);
});
