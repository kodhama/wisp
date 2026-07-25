#!/usr/bin/env node
// SPEC-0002@v7 S1/S12/S14 / R1-R2/R14/R17.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { runSanitizedCommand } from "./capability-safety.mjs";

const dockerfile = "test/e2e/Dockerfile";
const image = `wisp-codex-e2e:${createHash("sha256")
  .update(readFileSync(dockerfile))
  .update(readFileSync("package-lock.json"))
  .digest("hex")
  .slice(0, 16)}`;

async function docker(args) {
  const result = await runSanitizedCommand("docker", args, {
    maxOutputBytes: 16 * 1024 * 1024,
    timeoutMs: 15 * 60_000,
    killGraceMs: 10_000,
    redactStandaloneCapabilities: true,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

await docker(["build", "--file", dockerfile, "--tag", image, "."]);
await docker([
  "run",
  "--rm",
  "--init",
  "--network",
  "none",
  "--tmpfs",
  "/home/pwuser:rw,nosuid,nodev,noexec,mode=700,uid=1001,gid=1001",
  "--env",
  "HOME=/home/pwuser",
  "--env",
  "CODEX_HOME=/home/pwuser/.codex",
  image,
]);
