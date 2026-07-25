import { defineConfig, devices } from "@playwright/test";

const outputDir = process.env.WISP_PLAYWRIGHT_OUTPUT_DIR;
if (outputDir === undefined) throw new Error("missing guarded output directory");

export default defineConfig({
  testDir: ".",
  testMatch: "playwright-browser-failure.fixture.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 5_000,
  expect: { timeout: 100 },
  reporter: [["line"]],
  outputDir,
  use: {
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  projects: [{
    name: "chromium",
    use: { ...devices["Desktop Chrome"] },
  }],
});
