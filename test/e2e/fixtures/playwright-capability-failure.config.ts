import { defineConfig } from "@playwright/test";

const outputDir = process.env.WISP_PLAYWRIGHT_OUTPUT_DIR;
if (outputDir === undefined) throw new Error("missing guarded output directory");

export default defineConfig({
  testDir: ".",
  testMatch: "playwright-capability-failure.fixture.ts",
  workers: 1,
  retries: 0,
  reporter: [["line"]],
  outputDir,
  use: {
    trace: "off",
    video: "off",
    screenshot: "off",
  },
});
