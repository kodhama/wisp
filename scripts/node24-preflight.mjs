#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SUPPORTED_NODE_MAJOR } from "./node-support.mjs";

const NODE_VERSION = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;

export function assertNode24Version(version) {
  if (typeof version !== "string" || !NODE_VERSION.test(version)) {
    throw new Error("invalid Node runtime version");
  }
  const major = Number(version.slice(1, version.indexOf(".")));
  if (major !== SUPPORTED_NODE_MAJOR) {
    throw new Error(
      `unsupported Node runtime ${version}; expected major ${SUPPORTED_NODE_MAJOR}`,
    );
  }
  return version;
}

export function resolveEntrypoint(moduleUrl, invokedPath) {
  return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(invokedPath);
}

function run() {
  process.stdout.write(`${process.version}\n`);
  assertNode24Version(process.version);
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && resolveEntrypoint(import.meta.url, invokedPath)) {
  try {
    run();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
