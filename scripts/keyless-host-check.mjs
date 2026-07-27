#!/usr/bin/env node
// Keyless host check: proves the built plugin installs through the real Claude
// plugin path and that the host launches its MCP server — with no model turn and
// no API key.
//
// What it establishes that nothing else does: `test/e2e/codex-plugin.e2e.ts`
// spawns the server itself from the manifest's values, so it cannot show that a
// *host* accepts the package and starts it. This runs the real
// `plugin marketplace add` → `plugin install` → `mcp list` path instead.
//
// What it deliberately does NOT establish: that project binding resolved
// correctly. `ProjectResolver.resolve()` is lazy (src/mcp.ts), first reached
// inside a tool handler, so a successful handshake says nothing about which
// project the server bound to. Closing that needs either eager resolution
// (wisp#52) or a paid session.

import { execFile } from "node:child_process";
import { cp, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const PLUGIN = "plugins/wisp";
const MARKETPLACE = "wisp-local";

async function claude(args, env, cwd) {
  // The CLI reports failures on stdout with a ✘ marker and still exits 0 in
  // some paths, so callers assert on text rather than trusting the exit code.
  const { stdout, stderr } = await run("claude", args, {
    cwd,
    env: { ...process.env, ...env },
    maxBuffer: 8 * 1024 * 1024,
  }).catch((error) => ({ stdout: error.stdout ?? "", stderr: error.stderr ?? "" }));
  return `${stdout}${stderr}`;
}

function assert(condition, message, context) {
  if (condition) return;
  process.stderr.write(`keyless-host-check: ${message}\n${context}\n`);
  process.exitCode = 1;
  throw new Error(message);
}

const workspace = await mkdtemp(join(tmpdir(), "wisp-keyless-"));
try {
  const configDir = join(workspace, "config");
  const marketplace = join(workspace, "marketplace");
  const project = join(workspace, "project");
  await mkdir(configDir);
  await mkdir(project);
  await mkdir(join(marketplace, ".claude-plugin"), { recursive: true });

  // A local marketplace carrying the build under test, so the check exercises
  // this commit's payload rather than whatever the published catalog serves.
  await cp(PLUGIN, join(marketplace, "wisp"), { recursive: true });
  await writeFile(
    join(marketplace, ".claude-plugin", "marketplace.json"),
    `${JSON.stringify({
      name: MARKETPLACE,
      owner: { name: "wisp-ci" },
      plugins: [{ name: "wisp", description: "build under test", source: "./wisp" }],
    }, null, 2)}\n`,
  );

  const env = { CLAUDE_CONFIG_DIR: configDir };

  const added = await claude(["plugin", "marketplace", "add", marketplace], env, project);
  assert(/Successfully added marketplace/.test(added), "marketplace add failed", added);

  const installed = await claude(
    ["plugin", "install", `wisp@${MARKETPLACE}`, "--scope", "local"], env, project,
  );
  assert(/Successfully installed plugin/.test(installed), "plugin install failed", installed);

  const listed = await claude(["mcp", "list"], env, project);
  assert(
    /plugin:wisp:wisp:.*✔ Connected/u.test(listed),
    "host did not launch the plugin's MCP server",
    listed,
  );
  // Prove it ran the installed copy, not the source tree it was built from.
  assert(
    new RegExp(`${marketplace}[^\\s]*dist/wisp\\.mjs`).test(listed),
    "server did not launch from the installed plugin payload",
    listed,
  );

  process.stdout.write("keyless-host-check: install and host launch verified, no model turn\n");
} finally {
  await rm(workspace, { recursive: true, force: true });
}
