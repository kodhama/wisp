// SPEC-0001 v6: S31-S32, S35, S39-S43, S45, S48-S49, S53 / R38, R42, R46-R53, R57, R59, R61-R62, R71-R72.
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, it } from "vitest";

type DashboardSuccess = {
  ok: true;
  data: {
    url: string;
    reused: boolean;
  };
};

const transports: StdioClientTransport[] = [];

afterEach(async () => {
  await Promise.allSettled(transports.splice(0).map((transport) => transport.close()));
});

async function connectedClient(
  project: string,
  home: string,
): Promise<{ client: Client; transport: StdioClientTransport }> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve("plugins/wisp/dist/wisp.mjs")],
    env: {
      PATH: process.env.PATH ?? "",
      HOME: home,
      WISP_PROJECT_ROOT: project,
    },
    stderr: "pipe",
  });
  transports.push(transport);
  const client = new Client({ name: "wisp-dashboard-v6-test", version: "1.0.0" });
  await client.connect(transport);
  return { client, transport };
}

function dashboardResult(result: Awaited<ReturnType<Client["callTool"]>>): DashboardSuccess {
  expect(result.isError).toBe(false);
  const structured = result.structuredContent as DashboardSuccess;
  expect(result.content).toEqual([
    { type: "text", text: JSON.stringify(structured) },
  ]);
  expect(structured).toEqual({
    ok: true,
    data: {
      url: expect.stringMatching(
        /^http:\/\/127\.0\.0\.1:\d+\/#capability=[A-Za-z0-9_-]{43}$/u,
      ),
      reused: expect.any(Boolean),
    },
  });
  return structured;
}

function dashboardAccess(urlText: string): {
  origin: string;
  authorization: string;
  capability: string;
} {
  const url = new URL(urlText);
  const capability = new URLSearchParams(url.hash.slice(1)).get("capability");
  expect(capability).toMatch(/^[A-Za-z0-9_-]{43}$/u);
  return {
    origin: url.origin,
    authorization: `Bearer ${capability}`,
    capability: capability!,
  };
}

async function rawRequest(
  port: number,
  request: string,
  hardTimeoutMs = 2_000,
  endAfterWrite = true,
): Promise<{ response: string; elapsedMs: number }> {
  const started = Date.now();
  return await new Promise((resolveRaw, reject) => {
    const chunks: Buffer[] = [];
    const socket = createConnection({ host: "127.0.0.1", port });
    const hardTimeout = setTimeout(() => socket.destroy(), hardTimeoutMs);
    socket.once("error", (error) => {
      clearTimeout(hardTimeout);
      reject(error);
    });
    socket.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    socket.once("close", () => {
      clearTimeout(hardTimeout);
      resolveRaw({
        response: Buffer.concat(chunks).toString("utf8"),
        elapsedMs: Date.now() - started,
      });
    });
    socket.once("connect", () => {
      if (endAfterWrite) socket.end(request);
      else socket.write(request);
    });
  });
}

async function stalledResponseElapsed(
  port: number,
  request: string,
  hardTimeoutMs: number,
): Promise<number> {
  const started = Date.now();
  return await new Promise((resolveStall, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const hardTimeout = setTimeout(() => socket.destroy(), hardTimeoutMs);
    socket.once("error", (error) => {
      clearTimeout(hardTimeout);
      if ((error as NodeJS.ErrnoException).code === "ECONNRESET") {
        resolveStall(Date.now() - started);
      } else reject(error);
    });
    socket.once("close", () => {
      clearTimeout(hardTimeout);
      resolveStall(Date.now() - started);
    });
    socket.once("connect", () => {
      socket.pause();
      socket.write(request);
      // A paused Node socket defers its local close event while unread response
      // bytes remain buffered. Resume at the server deadline so the assertion
      // observes whether the peer already enforced the total-request close.
      setTimeout(() => socket.resume(), 10_050).unref();
    });
  });
}

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs = 2_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  expect(await predicate()).toBe(true);
}

describe("SPEC-0001 v6 dashboard plugin boundary", () => {
  it("S31/S32 resolves before state, starts only on an exact explicit call, and returns the exact envelope", async () => {
    const project = await mkdtemp(join(tmpdir(), "wisp-dashboard-project-"));
    const home = await mkdtemp(join(tmpdir(), "wisp-dashboard-home-"));
    const runtime = join(home, ".wisp/runtime/dashboard");
    const { client } = await connectedClient(project, home);

    expect((await client.listTools()).tools.map((tool) => tool.name)).toContain(
      "wisp_dashboard",
    );
    await expect(stat(runtime)).rejects.toMatchObject({ code: "ENOENT" });

    const checked = await client.callTool({
      name: "wisp_check",
      arguments: { run: "dashboard-lazy", agent: "worker" },
    });
    expect(checked.isError).toBe(false);
    await expect(stat(runtime)).rejects.toMatchObject({ code: "ENOENT" });

    const invalid = await client.callTool({
      name: "wisp_dashboard",
      arguments: { project: project },
    });
    expect(invalid).toMatchObject({
      isError: true,
      structuredContent: {
        ok: false,
        error: {
          code: "invalid_input",
          details: { field: "/project", reason: "unknown_property" },
        },
      },
    });
    await expect(stat(runtime)).rejects.toMatchObject({ code: "ENOENT" });

    const opened = dashboardResult(
      await client.callTool({ name: "wisp_dashboard", arguments: {} }),
    );
    expect(opened.data.reused).toBe(false);
    expect((await stat(runtime)).isDirectory()).toBe(true);
  });

  it("S35/S40/S41/S43 converges across processes and exposes only authenticated command-capable HTTP", async () => {
    const project = await mkdtemp(join(tmpdir(), "wisp-dashboard-shared-project-"));
    const home = await mkdtemp(join(tmpdir(), "wisp-dashboard-shared-home-"));
    const [{ client: first }, { client: second }] = await Promise.all([
      connectedClient(project, home),
      connectedClient(project, home),
    ]);

    const [one, two] = await Promise.all([
      first.callTool({ name: "wisp_dashboard", arguments: {} }),
      second.callTool({ name: "wisp_dashboard", arguments: {} }),
    ]);
    const dashboards = [dashboardResult(one), dashboardResult(two)];
    expect(new Set(dashboards.map((entry) => entry.data.url)).size).toBe(1);
    expect(dashboards.map((entry) => entry.data.reused).sort()).toEqual([false, true]);

    const access = dashboardAccess(dashboards[0]!.data.url);
    const unauthorized = await fetch(`${access.origin}/api/health`);
    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.json()).toEqual({
      ok: false,
      error: { code: "http_unauthorized" },
    });
    expect(unauthorized.headers.get("cache-control")).toBe("no-store");
    expect(unauthorized.headers.get("x-content-type-options")).toBe("nosniff");
    expect(unauthorized.headers.get("referrer-policy")).toBe("no-referrer");

    const health = await fetch(`${access.origin}/api/health`, {
      headers: { Authorization: access.authorization },
    });
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({
      ok: true,
      data: {
        protocol: 1,
        project_key: expect.stringMatching(/^[0-9a-f]{64}$/u),
        instance: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
        ),
      },
    });

    const hostile = await fetch(`${access.origin}/api/commands`, {
      method: "POST",
      headers: {
        Authorization: access.authorization,
        "Content-Type": "application/json",
        Origin: "https://example.invalid",
      },
      body: JSON.stringify({ run: "dashboard", type: "pause", target: "worker" }),
    });
    expect(hostile.status).toBe(403);
    const hostileText = await hostile.text();
    expect(JSON.parse(hostileText)).toEqual({
      ok: false,
      error: { code: "http_forbidden" },
    });
    expect(hostileText).not.toContain(access.capability);
    await expect(readFile(join(project, ".wisp/events.ndjson"))).rejects.toMatchObject({
      code: "ENOENT",
    });

    const command = await fetch(`${access.origin}/api/commands`, {
      method: "POST",
      headers: {
        Authorization: access.authorization,
        "Content-Type": "application/json",
        Origin: access.origin,
      },
      body: JSON.stringify({ run: "dashboard", type: "pause", target: "worker" }),
    });
    expect(command.status).toBe(201);
    const commandBody = (await command.json()) as {
      ok: boolean;
      data: { event: Record<string, unknown> };
    };
    expect(commandBody).toMatchObject({
      ok: true,
      data: {
        event: {
          v: 1,
          run: "dashboard",
          agent: "maintainer",
          kind: "command",
          command: {
            id: expect.stringMatching(
              /^cmd-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
            ),
            type: "pause",
            target: "worker",
          },
        },
      },
    });
    const lines = (await readFile(join(project, ".wisp/events.ndjson"), "utf8"))
      .trim()
      .split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toEqual(commandBody.data.event);
  }, 15_000);

  it("S48 serves semantic lifecycle, timeline, command-state, and parse-error views without markup sinks", async () => {
    const project = await mkdtemp(join(tmpdir(), "wisp-dashboard-ui-project-"));
    const home = await mkdtemp(join(tmpdir(), "wisp-dashboard-ui-home-"));
    const { client } = await connectedClient(project, home);
    const opened = dashboardResult(
      await client.callTool({ name: "wisp_dashboard", arguments: {} }),
    );
    const access = dashboardAccess(opened.data.url);

    const response = await fetch(`${access.origin}/`);
    expect(response.status).toBe(200);
    const html = await response.text();
    for (const visibleView of ["Runs", "Timeline", "Commands", "Parse errors"]) {
      expect(html).toContain(visibleView);
    }
    for (const projectedField of ["last_seen", "state", "activity", "verdict"]) {
      expect(html).toContain(projectedField);
    }
    for (const commandState of ["pending", "accepted", "rejected", "completed"]) {
      expect(html).toContain(commandState);
    }
    expect(html).toContain("visibilitychange");
    expect(html).toContain("2000");
    expect(html).toContain("5000");
    expect(html).toContain("textContent");
    expect(html).not.toMatch(/innerHTML|insertAdjacentHTML|document\.write/u);
  });

  it("S41 rejects a body on authenticated GET before canonical runtime work", async () => {
    const project = await mkdtemp(join(tmpdir(), "wisp-dashboard-get-body-project-"));
    const home = await mkdtemp(join(tmpdir(), "wisp-dashboard-get-body-home-"));
    const { client } = await connectedClient(project, home);
    const opened = dashboardResult(
      await client.callTool({ name: "wisp_dashboard", arguments: {} }),
    );
    const access = dashboardAccess(opened.data.url);
    const port = Number(new URL(access.origin).port);
    const { response } = await rawRequest(
      port,
      [
        "GET /api/health HTTP/1.1",
        `Host: 127.0.0.1:${port}`,
        `Authorization: ${access.authorization}`,
        "Content-Length: 1",
        "Connection: close",
        "",
        "x",
      ].join("\r\n"),
    );
    expect(response).toMatch(/^HTTP\/1\.1 400 /u);
    expect(response).toContain('"code":"http_invalid_request"');
    expect(response).not.toContain(access.capability);
  });

  it("S53 applies the five-second body deadline before the ten-second total deadline", async () => {
    const project = await mkdtemp(join(tmpdir(), "wisp-dashboard-body-timeout-project-"));
    const home = await mkdtemp(join(tmpdir(), "wisp-dashboard-body-timeout-home-"));
    const { client } = await connectedClient(project, home);
    const opened = dashboardResult(
      await client.callTool({ name: "wisp_dashboard", arguments: {} }),
    );
    const access = dashboardAccess(opened.data.url);
    const port = Number(new URL(access.origin).port);
    const { response, elapsedMs } = await rawRequest(
      port,
      [
        "POST /api/commands HTTP/1.1",
        `Host: 127.0.0.1:${port}`,
        `Authorization: ${access.authorization}`,
        `Origin: ${access.origin}`,
        "Content-Type: application/json",
        "Content-Length: 1",
        "Connection: close",
        "",
        "",
      ].join("\r\n"),
      6_250,
      false,
    );
    expect(elapsedMs).toBeGreaterThanOrEqual(4_900);
    expect(elapsedMs).toBeLessThan(6_000);
    expect(response).toMatch(/^HTTP\/1\.1 408 /u);
    expect(response).toContain('"code":"http_request_timeout"');
  }, 10_000);

  it("S41 rejects an oversized declared body immediately without waiting for withheld bytes", async () => {
    const project = await mkdtemp(join(tmpdir(), "wisp-dashboard-declared-body-project-"));
    const home = await mkdtemp(join(tmpdir(), "wisp-dashboard-declared-body-home-"));
    const { client } = await connectedClient(project, home);
    const opened = dashboardResult(
      await client.callTool({ name: "wisp_dashboard", arguments: {} }),
    );
    const access = dashboardAccess(opened.data.url);
    const port = Number(new URL(access.origin).port);
    const { response, elapsedMs } = await rawRequest(
      port,
      [
        "POST /api/commands HTTP/1.1",
        `Host: 127.0.0.1:${port}`,
        `Authorization: ${access.authorization}`,
        `Origin: ${access.origin}`,
        "Content-Type: application/json",
        "Content-Length: 32769",
        "Connection: close",
        "",
        "",
      ].join("\r\n"),
      2_000,
      false,
    );
    expect(elapsedMs).toBeLessThan(1_000);
    expect(response).toMatch(/^HTTP\/1\.1 413 /u);
    expect(response).toContain('"code":"http_body_too_large"');
  });

  it("S53 keeps an active response out of the idle phase and enforces the ten-second total deadline", async () => {
    const project = await mkdtemp(join(tmpdir(), "wisp-dashboard-total-timeout-project-"));
    const home = await mkdtemp(join(tmpdir(), "wisp-dashboard-total-timeout-home-"));
    await mkdir(join(project, ".wisp"));
    const line = `${JSON.stringify({
      v: 1,
      ts: "2026-07-24T12:00:00.000Z",
      run: "slow-response",
      agent: "worker",
      kind: "status",
      state: "working",
      activity: "x".repeat(96),
    })}\n`;
    await writeFile(
      join(project, ".wisp/events.ndjson"),
      line.repeat(Math.floor((14 * 1024 * 1024) / Buffer.byteLength(line))),
    );
    const { client } = await connectedClient(project, home);
    const opened = dashboardResult(
      await client.callTool({ name: "wisp_dashboard", arguments: {} }),
    );
    const access = dashboardAccess(opened.data.url);
    const port = Number(new URL(access.origin).port);
    const elapsedMs = await stalledResponseElapsed(
      port,
      [
        "GET /api/events HTTP/1.1",
        `Host: 127.0.0.1:${port}`,
        `Authorization: ${access.authorization}`,
        "Connection: keep-alive",
        "",
        "",
      ].join("\r\n"),
      11_500,
    );
    expect(elapsedMs).toBeGreaterThanOrEqual(9_500);
    expect(elapsedMs).toBeLessThan(11_250);
  }, 15_000);

  it("S33 rejects an existing group/other-writable runtime ancestor instead of repairing it", async () => {
    const project = await mkdtemp(join(tmpdir(), "wisp-dashboard-unsafe-project-"));
    const home = await mkdtemp(join(tmpdir(), "wisp-dashboard-unsafe-home-"));
    const unsafe = join(home, ".wisp");
    await mkdir(unsafe, { mode: 0o777 });
    await chmod(unsafe, 0o777);
    const { client } = await connectedClient(project, home);

    const result = await client.callTool({ name: "wisp_dashboard", arguments: {} });
    expect(result).toMatchObject({
      isError: true,
      structuredContent: {
        ok: false,
        error: {
          code: "dashboard_unavailable",
          details: { reason: "runtime_unsafe", retryable: false },
        },
      },
    });
    expect((await stat(unsafe)).mode & 0o777).toBe(0o777);
    await expect(stat(join(unsafe, "runtime/dashboard"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("S36 returns owner_starting for a live compatible owner beyond convergence", async () => {
    const projectInput = await mkdtemp(join(tmpdir(), "wisp-dashboard-starting-project-"));
    const project = await realpath(projectInput);
    const homeInput = await mkdtemp(join(tmpdir(), "wisp-dashboard-starting-home-"));
    const home = await realpath(homeInput);
    const projectKey = createHash("sha256").update(project, "utf8").digest("hex");
    const ownerDir = join(home, ".wisp/runtime/dashboard", projectKey, "owner");
    await mkdir(ownerDir, { recursive: true, mode: 0o700 });
    await chmod(join(home, ".wisp"), 0o700);
    await chmod(join(home, ".wisp/runtime"), 0o700);
    await chmod(join(home, ".wisp/runtime/dashboard"), 0o700);
    await chmod(join(home, ".wisp/runtime/dashboard", projectKey), 0o700);
    const identity = await import("../src/process-identity.ts").then(
      ({ currentProcessIdentity }) => currentProcessIdentity(),
    );
    expect(identity).toEqual(expect.any(String));
    await writeFile(
      join(ownerDir, "owner.json"),
      JSON.stringify({
        schema: 1,
        protocol: 1,
        state: "starting",
        project,
        project_key: projectKey,
        instance: "00000000-0000-4000-8000-000000000001",
        pid: process.pid,
        process_identity: identity,
        created_at: new Date().toISOString(),
      }),
      { mode: 0o600 },
    );
    const { client } = await connectedClient(project, home);

    const result = await client.callTool({ name: "wisp_dashboard", arguments: {} });
    expect(result).toMatchObject({
      isError: true,
      structuredContent: {
        ok: false,
        error: {
          code: "dashboard_unavailable",
          details: { reason: "owner_starting", retryable: true },
        },
      },
    });
  }, 5_000);

  it("S39 cleans up the owning listener and permits explicit recovery from another session", async () => {
    const project = await mkdtemp(join(tmpdir(), "wisp-dashboard-cleanup-project-"));
    const home = await mkdtemp(join(tmpdir(), "wisp-dashboard-cleanup-home-"));
    await mkdir(project, { recursive: true });
    const { client: owner, transport: ownerTransport } = await connectedClient(project, home);
    const { client: follower } = await connectedClient(project, home);

    const initial = dashboardResult(
      await owner.callTool({ name: "wisp_dashboard", arguments: {} }),
    );
    const reused = dashboardResult(
      await follower.callTool({ name: "wisp_dashboard", arguments: {} }),
    );
    expect(reused.data).toEqual({ url: initial.data.url, reused: true });
    const initialAccess = dashboardAccess(initial.data.url);
    const initialPort = Number(new URL(initialAccess.origin).port);
    const activeChunks: Buffer[] = [];
    const activeSocket = createConnection({ host: "127.0.0.1", port: initialPort });
    activeSocket.on("data", (chunk) => activeChunks.push(Buffer.from(chunk)));
    activeSocket.on("error", () => undefined);
    await new Promise<void>((resolveConnection, reject) => {
      activeSocket.once("connect", resolveConnection);
      activeSocket.once("error", reject);
    });
    activeSocket.write([
      "POST /api/commands HTTP/1.1",
      `Host: 127.0.0.1:${initialPort}`,
      `Authorization: ${initialAccess.authorization}`,
      `Origin: ${initialAccess.origin}`,
      "Content-Type: application/json",
      "Content-Length: 10",
      "",
      "{",
    ].join("\r\n"));
    const activeClosed = new Promise<void>((resolveClose) => {
      activeSocket.once("close", () => resolveClose());
    });

    const shutdownStarted = Date.now();
    await ownerTransport.close();
    await activeClosed;
    expect(Date.now() - shutdownStarted).toBeLessThanOrEqual(1_250);
    expect(Buffer.concat(activeChunks).toString("utf8")).not.toContain(
      "http_request_timeout",
    );
    const ownerIndex = transports.indexOf(ownerTransport);
    if (ownerIndex >= 0) transports.splice(ownerIndex, 1);

    const canonicalProject = await realpath(project);
    const canonicalHome = await realpath(home);
    const ownerDirectory = join(
      canonicalHome,
      ".wisp/runtime/dashboard",
      createHash("sha256").update(canonicalProject, "utf8").digest("hex"),
      "owner",
    );
    await expect(stat(ownerDirectory)).rejects.toMatchObject({ code: "ENOENT" });

    await waitFor(async () => {
      try {
        await fetch(`${initialAccess.origin}/api/health`, {
          headers: { Authorization: initialAccess.authorization },
        });
        return false;
      } catch {
        return true;
      }
    });

    const replacement = dashboardResult(
      await follower.callTool({ name: "wisp_dashboard", arguments: {} }),
    );
    expect(replacement.data.reused).toBe(false);
    expect(replacement.data.url).not.toBe(initial.data.url);

    const replacementAccess = dashboardAccess(replacement.data.url);
    const currentHealth = await fetch(`${replacementAccess.origin}/api/health`, {
      headers: { Authorization: replacementAccess.authorization },
    });
    expect(currentHealth.status).toBe(200);
    const staleCapability = await fetch(`${replacementAccess.origin}/api/health`, {
      headers: { Authorization: initialAccess.authorization },
    });
    expect(staleCapability.status).toBe(401);
    expect(await staleCapability.text()).not.toContain(initialAccess.capability);
  }, 15_000);
});
