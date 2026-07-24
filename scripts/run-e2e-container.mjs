#!/usr/bin/env node
// SPEC-0002 v2: S1 / R1-R2.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const dockerfile = "test/e2e/Dockerfile";
const image = `wisp-codex-e2e:${createHash("sha256")
  .update(readFileSync(dockerfile))
  .update(readFileSync("package-lock.json"))
  .digest("hex")
  .slice(0, 16)}`;

function docker(args) {
  const result = spawnSync("docker", args, { stdio: "inherit", shell: false });
  if (result.error) {
    process.stderr.write(`docker unavailable: ${result.error.message}\n`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

docker(["build", "--file", dockerfile, "--tag", image, "."]);
docker([
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
