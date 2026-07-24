// SPEC-0001 v6: S2, S3a, S9, S11, S18, S21-S22, S31-S32 / R2-R3, R11, R13, R21, R27, R37-R38.
import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, it } from "vitest";
import { TOOL_NAMES } from "../src/mcp.ts";

const transports: StdioClientTransport[] = [];

afterEach(async () => {
  await Promise.all(transports.splice(0).map((transport) => transport.close()));
});

describe("SPEC-0001 concurrent cross-process acknowledgement", () => {
  it("allows exactly one acknowledgement of one pending command", async () => {
    const project = await mkdtemp(join(tmpdir(), "wisp-ack-race-"));
    await mkdir(join(project, ".wisp"));
    const command = {
      v: 1,
      ts: "2026-07-23T12:34:56.789Z",
      run: "race",
      agent: "human",
      kind: "command",
      command: { id: "one", type: "steer", target: "*" },
    };
    await writeFile(join(project, ".wisp/events.ndjson"), `${JSON.stringify(command)}\n`);

    async function connectedClient(): Promise<Client> {
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [resolve("plugins/wisp/dist/wisp.mjs")],
        env: { PATH: process.env.PATH ?? "", WISP_PROJECT_ROOT: project },
        stderr: "pipe",
      });
      transports.push(transport);
      const client = new Client({ name: "ack-race", version: "1.0.0" });
      await client.connect(transport);
      return client;
    }

    const [first, second] = await Promise.all([connectedClient(), connectedClient()]);
    const results = await Promise.all([
      first.callTool({ name: "wisp_ack", arguments: { run: "race", agent: "a", command_id: "one" } }),
      second.callTool({ name: "wisp_ack", arguments: { run: "race", agent: "b", command_id: "one" } }),
    ]);
    expect(results.filter((result) => result.isError === false)).toHaveLength(1);
    expect(results.filter((result) =>
      (result.structuredContent as { error?: { code?: string } }).error?.code === "command_not_pending",
    )).toHaveLength(1);
  });
});

describe("SPEC-0001 v6 S2/S9/S11/S18/S21/S22/S31 — clean bundled stdio MCP", () => {
  it("lists exactly seven tools, checks, and writes only to its selected project", async () => {
    const project = await mkdtemp(join(tmpdir(), "wisp-clean-project-"));
    const unrelatedCwd = await mkdtemp(join(tmpdir(), "wisp-clean-cwd-"));
    const stderr: string[] = [];
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [resolve("plugins/wisp/dist/wisp.mjs")],
      cwd: unrelatedCwd,
      env: { PATH: process.env.PATH ?? "", WISP_PROJECT_ROOT: project },
      stderr: "pipe",
    });
    transports.push(transport);
    transport.stderr?.on("data", (chunk) => stderr.push(String(chunk)));
    const client = new Client({ name: "wisp-contract-test", version: "1.0.0" });
    await client.connect(transport);

    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name)).toEqual(TOOL_NAMES);
    const checked = await client.callTool({
      name: "wisp_check",
      arguments: { run: "run-1", agent: "worker" },
    });
    expect(checked.isError).toBe(false);
    expect(checked.structuredContent).toEqual({
      ok: true,
      data: { commands: [], parse_errors: [] },
    });

    const written = await client.callTool({
      name: "wisp_status",
      arguments: {
        run: "run-1",
        agent: "worker",
        state: "working",
        activity: "bundle smoke",
        via: "dispatcher",
      },
    });
    expect(written.isError).toBe(false);
    const line = await readFile(join(project, ".wisp/events.ndjson"), "utf8");
    expect(line.endsWith("\n")).toBe(true);
    const stored = JSON.parse(line);
    expect(stored).toEqual((written.structuredContent as { data: { event: unknown } }).data.event);
    expect(stored).toMatchObject({ meta: { via: "dispatcher" } });
    expect(stored.to).toBeUndefined();
    await expect(readFile(join(unrelatedCwd, ".wisp/events.ndjson"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(stderr.join("")).toBe("");
  });

  it.each(["configured CODEX_HOME", "default home"] as const)(
    "launches the exact Codex bootstrap from the active session directory with %s",
    async (homeMode) => {
      const project = await mkdtemp(join(tmpdir(), "wisp-codex-project-"));
      const home = await mkdtemp(join(tmpdir(), "wisp-codex-user-home-"));
      const codexHome =
        homeMode === "configured CODEX_HOME"
          ? await mkdtemp(join(tmpdir(), "wisp-codex-home-"))
          : join(home, ".codex");
      const manifest = JSON.parse(
        await readFile(resolve("plugins/wisp/.codex-plugin/plugin.json"), "utf8"),
      );
      const bundleDirectory = join(
        codexHome,
        "plugins/cache/kodhama/wisp",
        manifest.version,
        "dist",
      );
      await mkdir(bundleDirectory, { recursive: true });
      await copyFile(
        resolve("plugins/wisp/dist/wisp.mjs"),
        join(bundleDirectory, "wisp.mjs"),
      );

      const transport = new StdioClientTransport({
        command: manifest.mcpServers.wisp.command,
        args: manifest.mcpServers.wisp.args,
        cwd: project,
        env: {
          PATH: process.env.PATH ?? "",
          HOME: home,
          ...(homeMode === "configured CODEX_HOME" ? { CODEX_HOME: codexHome } : {}),
        },
        stderr: "pipe",
      });
      transports.push(transport);
      const client = new Client({ name: "codex-bootstrap-test", version: "1.0.0" });
      await client.connect(transport);

      expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(TOOL_NAMES);
      expect(
        await client.callTool({
          name: "wisp_check",
          arguments: { run: "codex-bootstrap", agent: "worker" },
        }),
      ).toMatchObject({ isError: false });
      expect(
        await client.callTool({
          name: "wisp_status",
          arguments: {
            run: "codex-bootstrap",
            agent: "worker",
            state: "working",
          },
        }),
      ).toMatchObject({ isError: false });

      const bus = await readFile(join(project, ".wisp/events.ndjson"), "utf8");
      expect(bus.trim()).toContain('"run":"codex-bootstrap"');
      await expect(
        readFile(join(codexHome, ".wisp/events.ndjson")),
      ).rejects.toMatchObject({ code: "ENOENT" });
    },
  );

  it("fails the Codex bootstrap on stderr when its installed bundle is missing", async () => {
    const project = await mkdtemp(join(tmpdir(), "wisp-codex-missing-project-"));
    const home = await mkdtemp(join(tmpdir(), "wisp-codex-missing-home-"));
    const codexHome = join(home, ".codex");
    const manifest = JSON.parse(
      await readFile(resolve("plugins/wisp/.codex-plugin/plugin.json"), "utf8"),
    );
    const child = spawn(
      manifest.mcpServers.wisp.command,
      manifest.mcpServers.wisp.args,
      {
        cwd: project,
        env: {
          PATH: process.env.PATH ?? "",
          HOME: home,
          CODEX_HOME: codexHome,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const stdout: string[] = [];
    const stderr: string[] = [];
    child.stdout.on("data", (chunk) => stdout.push(String(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(String(chunk)));
    const code = await new Promise<number | null>((resolveCode, reject) => {
      child.once("error", reject);
      child.once("close", resolveCode);
    });

    expect(code).toBe(1);
    expect(stdout.join("")).toBe("");
    expect(stderr.join("")).toMatch(/^wisp failed to load: /u);
  });
});
