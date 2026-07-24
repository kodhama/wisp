// SPEC-0002 v2: S1-S5 / R1-R4.
import { createHash, randomUUID } from "node:crypto";
import {
  appendFile,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  realpath,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { expect, test, type Browser } from "@playwright/test";

const RELEASE_PATHS = [
  ".claude-plugin/plugin.json",
  ".codex-plugin/plugin.json",
  ".mcp.json",
  "README.md",
  "dist/wisp.mjs",
  "qualification.json",
  "skills/dashboard/SKILL.md",
  "skills/wisp/SKILL.md",
];
const TOOL_NAMES = [
  "wisp_status",
  "wisp_heartbeat",
  "wisp_verdict",
  "wisp_question",
  "wisp_check",
  "wisp_ack",
  "wisp_dashboard",
];
const sourcePlugin = resolve("plugins/wisp");

type Connected = {
  client: Client;
  transport: StdioClientTransport;
  close: () => Promise<void>;
};

async function inventory(root: string): Promise<string[]> {
  const paths: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else paths.push(relative(root, path));
    }
  }
  await visit(root);
  return paths.sort();
}

async function copyCandidate(codexHome: string): Promise<{
  plugin: string;
  manifest: {
    version: string;
    mcpServers: {
      wisp: {
        command: string;
        args: string[];
        env_vars?: string[];
      };
    };
  };
}> {
  expect(await inventory(sourcePlugin)).toEqual(RELEASE_PATHS);
  const manifest = JSON.parse(
    await readFile(join(sourcePlugin, ".codex-plugin/plugin.json"), "utf8"),
  );
  const plugin = join(
    codexHome,
    "plugins/cache/kodhama/wisp",
    manifest.version,
  );
  for (const path of RELEASE_PATHS) {
    const target = join(plugin, path);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(sourcePlugin, path), target);
    expect(await readFile(target)).toEqual(await readFile(join(sourcePlugin, path)));
  }
  expect(await inventory(plugin)).toEqual(RELEASE_PATHS);
  return { plugin, manifest };
}

async function connect(
  manifest: Awaited<ReturnType<typeof copyCandidate>>["manifest"],
  project: string,
  home: string,
  codexHome: string,
): Promise<Connected> {
  const declared = Object.fromEntries(
    (manifest.mcpServers.wisp.env_vars ?? []).flatMap((name) => {
      const value = name === "CODEX_HOME" ? codexHome : process.env[name];
      return value === undefined ? [] : [[name, value]];
    }),
  );
  const transport = new StdioClientTransport({
    command: manifest.mcpServers.wisp.command,
    args: manifest.mcpServers.wisp.args,
    cwd: project,
    env: {
      PATH: process.env.PATH ?? "",
      HOME: home,
      ...declared,
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "wisp-codex-e2e", version: "1.0.0" });
  await client.connect(transport);
  let closed = false;
  return {
    client,
    transport,
    close: async () => {
      if (closed) return;
      closed = true;
      await client.close();
    },
  };
}

function toolData<T>(result: Awaited<ReturnType<Client["callTool"]>>): T {
  expect(result.isError).toBe(false);
  expect(result.structuredContent).toMatchObject({ ok: true });
  return (result.structuredContent as { ok: true; data: T }).data;
}

function projectKey(project: string): string {
  return createHash("sha256").update(project, "utf8").digest("hex");
}

function ownerFile(home: string, project: string): string {
  return join(
    home,
    ".wisp/runtime/dashboard",
    projectKey(project),
    "owner/owner.json",
  );
}

async function expectAbsent(path: string): Promise<void> {
  await expect(lstat(path)).rejects.toMatchObject({ code: "ENOENT" });
}

async function waitFor(
  predicate: () => Promise<boolean>,
  timeout = 5_000,
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  expect(await predicate()).toBe(true);
}

async function childLoopbackListeners(pid: number): Promise<number[]> {
  if (process.platform !== "linux") return [];
  const inodes = new Set<string>();
  for (const fd of await readdir(`/proc/${pid}/fd`)) {
    const target = await readlink(`/proc/${pid}/fd/${fd}`).catch(() => "");
    const match = /^socket:\[(\d+)\]$/u.exec(target);
    if (match) inodes.add(match[1]!);
  }
  const ports: number[] = [];
  for (const table of ["tcp", "tcp6"]) {
    const text = await readFile(`/proc/${pid}/net/${table}`, "utf8");
    for (const line of text.trim().split("\n").slice(1)) {
      const fields = line.trim().split(/\s+/u);
      if (fields[3] !== "0A" || !inodes.has(fields[9]!)) continue;
      const [address, port] = fields[1]!.split(":");
      if (address === "0100007F" || address === "0000000000000000FFFF00000100007F") {
        ports.push(Number.parseInt(port!, 16));
      }
    }
  }
  return ports;
}

async function callDashboard(connection: Connected): Promise<{
  url: string;
  reused: boolean;
}> {
  return toolData(await connection.client.callTool({
    name: "wisp_dashboard",
    arguments: {},
  }));
}

async function health(browser: Browser, urlText: string): Promise<number> {
  const url = new URL(urlText);
  const capability = new URLSearchParams(url.hash.slice(1)).get("capability");
  const context = await browser.newContext();
  try {
    return (await context.request.get(`${url.origin}/api/health`, {
      headers: { Authorization: `Bearer ${capability}` },
    })).status();
  } finally {
    await context.close();
  }
}

test("staged Codex adapter, MCP, project singleton, dashboard UI, security, and recovery", async ({
  browser,
}) => {
  const root = await mkdtemp(join(tmpdir(), "wisp-codex-e2e-"));
  const connections: Connected[] = [];
  const contexts: Awaited<ReturnType<Browser["newContext"]>>[] = [];

  try {
    const home = await mkdtemp(join(root, "home-"));
    const codexHome = await mkdtemp(join(root, "codex-home-"));
    const projectOne = await realpath(await mkdtemp(join(root, "project-one-")));
    const projectTwo = await realpath(await mkdtemp(join(root, "project-two-")));
    const { manifest } = await copyCandidate(codexHome);
    const sentinel = `e2e-${randomUUID()}`;
    const agent = `agent-${randomUUID()}`;
    const state = "working";
    const activity = `activity-${randomUUID()}`;
    const verdict = `verdict-${randomUUID()}`;
    const malformed = `{malformed-${randomUUID()}`;
    await expectAbsent(join(projectOne, "node_modules"));
    await expectAbsent(join(projectTwo, "node_modules"));
    const first = await connect(manifest, projectOne, home, codexHome);
    const second = await connect(manifest, projectOne, home, codexHome);
    const isolated = await connect(manifest, projectTwo, home, codexHome);
    connections.push(first, second, isolated);

    expect((await first.client.listTools()).tools.map(({ name }) => name)).toEqual(TOOL_NAMES);
    expect((await second.client.listTools()).tools.map(({ name }) => name)).toEqual(TOOL_NAMES);
    expect((await isolated.client.listTools()).tools.map(({ name }) => name)).toEqual(TOOL_NAMES);
    await expectAbsent(ownerFile(home, projectOne));
    await expectAbsent(ownerFile(home, projectTwo));
    const firstPid = first.transport.pid;
    const secondPid = second.transport.pid;
    expect(firstPid).toEqual(expect.any(Number));
    expect(secondPid).toEqual(expect.any(Number));
    expect(await childLoopbackListeners(firstPid!)).toEqual([]);
    expect(await childLoopbackListeners(secondPid!)).toEqual([]);

    toolData(await first.client.callTool({
      name: "wisp_status",
      arguments: { run: sentinel, agent, state, activity },
    }));
    toolData(await first.client.callTool({
      name: "wisp_verdict",
      arguments: { run: sentinel, agent, verdict },
    }));
    toolData(await isolated.client.callTool({
      name: "wisp_status",
      arguments: {
        run: `${sentinel}-isolated`,
        agent,
        state: "working",
        activity: "isolated",
      },
    }));

    const [firstDashboard, secondDashboard, isolatedDashboard] = await Promise.all([
      callDashboard(first),
      callDashboard(second),
      callDashboard(isolated),
    ]);
    expect(firstDashboard.url).toBe(secondDashboard.url);
    expect([firstDashboard.reused, secondDashboard.reused].sort()).toEqual([false, true]);
    expect(isolatedDashboard.reused).toBe(false);
    expect(isolatedDashboard.url).not.toBe(firstDashboard.url);
    expect(await readFile(join(projectOne, ".wisp/events.ndjson"), "utf8"))
      .not.toContain(`${sentinel}-isolated`);
    expect(await readFile(join(projectTwo, ".wisp/events.ndjson"), "utf8"))
      .not.toContain(`"run":"${sentinel}"`);
    expect(await health(browser, firstDashboard.url)).toBe(200);
    expect(await health(browser, isolatedDashboard.url)).toBe(200);

    const context = await browser.newContext();
    contexts.push(context);
    const page = await context.newPage();
    const requested: string[] = [];
    page.on("request", (request) => requested.push(request.url()));
    await page.goto(firstDashboard.url);
    await expect(page.locator("#status")).toHaveText("Live");
    const dashboardUrl = new URL(firstDashboard.url);
    const capability = new URLSearchParams(dashboardUrl.hash.slice(1)).get("capability");
    const assertRequestsStayOnOrigin = (): void => {
      expect(requested.every((urlText) => new URL(urlText).origin === dashboardUrl.origin)).toBe(true);
      expect(requested.every((urlText) => new URL(urlText).search === "")).toBe(true);
      expect(requested.every((urlText) => new URL(urlText).hash === "")).toBe(true);
    };
    expect(page.url()).toBe(`${dashboardUrl.origin}/`);
    assertRequestsStayOnOrigin();

    const lifecycle = page.locator(
      `[data-wisp-view="lifecycle"] [data-run="${sentinel}"][data-agent="${agent}"]`,
    );
    await expect(lifecycle.locator('[data-field="state"]')).toContainText(state);
    await expect(lifecycle.locator('[data-field="activity"]')).toContainText(activity);
    await expect(lifecycle.locator('[data-field="verdict"]')).toContainText(verdict);
    await expect(page.locator('[data-wisp-view="timeline"] [data-event-index]')).toHaveCount(2);
    await expect(page.locator('[data-event-index="0"] [data-field="kind"]')).toContainText("status");
    await expect(page.locator('[data-event-index="1"] [data-field="kind"]')).toContainText("verdict");

    const unauthorized = await context.request.get(`${dashboardUrl.origin}/api/events`);
    expect(unauthorized.status()).toBe(401);
    const crossOrigin = await context.request.post(`${dashboardUrl.origin}/api/commands`, {
      headers: {
        Authorization: `Bearer ${capability}`,
        Origin: "https://hostile.invalid",
        "Content-Type": "application/json",
      },
      data: { run: sentinel, target: agent, type: "pause" },
    });
    expect(crossOrigin.status()).toBe(403);

    await page.locator('input[name="run"]').fill(sentinel);
    await page.locator('input[name="target"]').fill(agent);
    await page.locator('select[name="type"]').selectOption("pause");
    await page.locator("#command button").click();
    await expect(page.locator("#status")).toHaveText("Live");

    const bus = join(projectOne, ".wisp/events.ndjson");
    let commandId = "";
    await waitFor(async () => {
      const events = (await readFile(bus, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
      const commands = events.filter((event) =>
        event.kind === "command" && event.run === sentinel && event.command?.type === "pause"
      );
      commandId = commands[0]?.command?.id ?? "";
      return commands.length === 1 && commandId !== "";
    });
    const command = page.locator(
      `[data-wisp-view="commands"] [data-command-id="${commandId}"]`,
    );
    await expect(command.locator('[data-field="type"]')).toContainText("pause");
    await expect(command.locator('[data-field="target"]')).toContainText(agent);
    await expect(command.locator('[data-field="command-status"]')).toContainText("pending");

    toolData(await first.client.callTool({
      name: "wisp_ack",
      arguments: {
        run: sentinel,
        agent,
        command_id: commandId,
        result: "accepted",
      },
    }));
    await appendFile(bus, `${malformed}\n`, "utf8");
    await expect(page.locator("#status")).toHaveText("Live");
    await expect(command.locator('[data-field="command-status"]')).toContainText("accepted");
    const parseError = page.locator('[data-wisp-view="parse-errors"] [data-line="5"]');
    await expect(parseError.locator('[data-field="parse-reason"]')).toContainText("invalid_json");
    await expect(parseError.locator('[data-field="parse-raw"]')).toContainText(malformed);
    await expect(page.locator('[data-wisp-view="timeline"] [data-event-index]')).toHaveCount(4);
    for (let index = 0; index < 4; index += 1) {
      await expect(page.locator(`[data-wisp-view="timeline"] [data-event-index="${index}"]`))
        .toHaveCount(1);
    }
    assertRequestsStayOnOrigin();

    const publisher = firstDashboard.reused ? second : first;
    const contender = publisher === first ? second : first;
    const isolatedOwnerBefore = await readFile(ownerFile(home, projectTwo), "utf8");
    await context.close();
    contexts.splice(contexts.indexOf(context), 1);
    await publisher.close();
    await waitFor(async () => {
      try {
        await lstat(ownerFile(home, projectOne));
        return false;
      } catch (error) {
        return (error as NodeJS.ErrnoException).code === "ENOENT";
      }
    });
    expect(await readFile(ownerFile(home, projectTwo), "utf8")).toBe(isolatedOwnerBefore);
    expect(await health(browser, isolatedDashboard.url)).toBe(200);

    const replacement = await connect(manifest, projectOne, home, codexHome);
    connections.push(replacement);
    expect((await replacement.client.listTools()).tools.map(({ name }) => name)).toEqual(TOOL_NAMES);
    const replacementDashboard = await callDashboard(replacement);
    expect(replacementDashboard.reused).toBe(false);
    expect(replacementDashboard.url).not.toBe(firstDashboard.url);
    expect(await health(browser, replacementDashboard.url)).toBe(200);
    expect(toolData(await contender.client.callTool({
      name: "wisp_check",
      arguments: { run: sentinel, agent },
    }))).toMatchObject({ parse_errors: [{ line: 5, reason: "invalid_json", raw: malformed }] });
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()));
    await Promise.allSettled(connections.map((connection) => connection.close()));
    await rm(root, { recursive: true, force: true });
  }
});
