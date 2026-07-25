import { createServer, type Server } from "node:http";
import {
  test,
  expect,
  type Browser,
  type BrowserContext,
} from "@playwright/test";

const capability = process.env.WISP_FAILURE_CAPABILITY;
const failure = process.env.WISP_FAILURE_KIND;
const nonce = process.env.WISP_E2E_CONTROL_NONCE;
const stage = process.env.WISP_FAILURE_STAGE;
if (!capability || !failure || !nonce || !stage) {
  throw new Error("missing failure-campaign input");
}

test(`${stage}:${failure}`, async ({ playwright }) => {
  const browsers: Browser[] = [];
  const contexts: BrowserContext[] = [];
  let server: Server | undefined;
  let cleanupFailure = false;
  let dashboardUrl = "";

  const injectFailure = async (): Promise<void> => {
    const markFailure = (): void => {
      process.stdout.write(
        `\x1eWISP_FAILURE:${nonce}:${stage}:${failure}\x1f`,
      );
    };
    switch (failure) {
      case "timeout":
        markFailure();
        await expect.poll(
          () => capability,
          { message: `${stage}-timeout=${capability}`, timeout: 25 },
        ).toBe("<redacted>");
        return;
      case "crash": {
        process.stderr.write(`${stage}-crash=${capability}\n`);
        const crashServer = await playwright.chromium.launchServer();
        const crashBrowser = await playwright.chromium.connect(
          crashServer.wsEndpoint(),
        );
        const disconnected = new Promise<void>((resolveDisconnected) =>
          crashBrowser.once("disconnected", () => resolveDisconnected())
        );
        crashServer.process().kill("SIGKILL");
        await disconnected;
        markFailure();
        await crashBrowser.newContext();
        throw new Error(`${stage}-crash=${capability}`);
      }
      case "signal":
        markFailure();
        process.stderr.write(`${stage}-signal=${capability}\n`);
        process.kill(process.pid, "SIGTERM");
        await new Promise(() => undefined);
        return;
      case "cleanup":
        cleanupFailure = true;
        return;
      default:
        markFailure();
        expect(`${stage}-assertion=${capability}`).toBe("<redacted>");
    }
  };
  const failAtStage = async (): Promise<boolean> => {
    process.stdout.write(
      `\x1eWISP_STAGE:${nonce}:${stage}:${failure}\x1f`,
    );
    await injectFailure();
    return cleanupFailure;
  };

  try {
    server = createServer((request, response) => {
      if (request.url === "/api/dashboard") {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ url: dashboardUrl }));
        return;
      }
      if (request.url === "/api/events") {
        response.statusCode =
          request.headers.authorization === `Bearer ${capability}` ? 200 : 401;
        response.end("[]");
        return;
      }
      response.setHeader("content-type", "text/html");
      response.end([
        "<!doctype html><html><body>",
        `<main data-capability="${capability}">ready</main>`,
        "<script>",
        `console.log("console=${capability}");`,
        `fetch("/api/events",{headers:{Authorization:"Bearer ${capability}"}});`,
        "</script></body></html>",
      ].join(""));
    });
    await new Promise<void>((resolveListen, reject) => {
      server!.once("error", reject);
      server!.listen(0, "127.0.0.1", resolveListen);
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("failure server did not bind");
    }
    const origin = `http://127.0.0.1:${address.port}`;
    dashboardUrl = `${origin}/#capability=${capability}`;
    process.stdout.write(
      `\x1eWISP_CAPABILITY:${nonce}:${capability}\x1f`,
    );

    // Keep one fully capability-bearing baseline live while a second
    // acquisition lifecycle fails at the requested exact stage.
    const baselineBrowser = await playwright.chromium.launch();
    browsers.push(baselineBrowser);
    const baselineContext = await baselineBrowser.newContext();
    contexts.push(baselineContext);
    const baselinePage = await baselineContext.newPage();
    await baselinePage.goto(dashboardUrl);
    await expect(baselinePage.locator("main")).toHaveText("ready");
    await baselineContext.request.get(`${origin}/api/events`, {
      headers: { Authorization: `Bearer ${capability}` },
    });

    const scheduledCleanupFailure = await test.step(stage, async () => {
      switch (stage) {
        case "pre-dashboard":
          return failAtStage();
        case "dashboard-call":
          await fetch(`${origin}/api/dashboard`);
          return failAtStage();
        case "browser-launch": {
          const stageBrowser = await playwright.chromium.launch();
          browsers.push(stageBrowser);
          return failAtStage();
        }
        case "navigation": {
          const stageContext = await baselineBrowser.newContext();
          contexts.push(stageContext);
          const stagePage = await stageContext.newPage();
          await stagePage.goto(dashboardUrl);
          return failAtStage();
        }
        case "dom":
          await expect(baselinePage.locator("main"))
            .toHaveAttribute("data-capability", capability);
          return failAtStage();
        case "authorization":
          await baselineContext.request.get(`${origin}/api/events`, {
            headers: { Authorization: `Bearer ${capability}` },
          });
          return failAtStage();
        case "cleanup": {
          const cleanupProbe = await baselineBrowser.newContext();
          await cleanupProbe.close();
          return failAtStage();
        }
        case "redaction":
          process.stdout.write(
            `\x1eWISP_CAPABILITY:${nonce}:malformed\x1f`,
          );
          return failAtStage();
        default:
          throw new Error("unknown failure stage");
      }
    });
    if (scheduledCleanupFailure) return;
  } finally {
    for (const context of contexts.reverse()) {
      await context.close().catch(() => undefined);
    }
    for (const browser of browsers.reverse()) {
      await browser.close().catch(() => undefined);
    }
    if (server !== undefined) {
      await new Promise<void>((resolveClose) =>
        server!.close(() => resolveClose())
      );
    }
    if (cleanupFailure) {
      process.stdout.write(
        `\x1eWISP_FAILURE:${nonce}:${stage}:${failure}\x1f`,
      );
      throw new Error(`${stage}-cleanup=${capability}`);
    }
  }
});
