"use strict";

// SPEC-0002@v7 S12/R14: disable Playwright's implicit artifact writers
// before they can reach the configured output directory.
const fs = require("node:fs");
const path = require("node:path");

const configured = process.env.WISP_PLAYWRIGHT_OUTPUT_DIR;
if (!configured || !path.isAbsolute(configured)) {
  throw new Error("WISP_PLAYWRIGHT_OUTPUT_DIR must be absolute");
}
const output = path.resolve(configured);
const insideOutput = (candidate) => {
  if (typeof candidate !== "string" && !Buffer.isBuffer(candidate) &&
      !(candidate instanceof URL)) {
    return false;
  }
  const resolved = path.resolve(candidate instanceof URL
    ? require("node:url").fileURLToPath(candidate)
    : candidate.toString());
  return resolved === output || resolved.startsWith(`${output}${path.sep}`);
};
const deny = () => {
  const error = new Error("Playwright artifact writer disabled");
  error.code = "EPERM";
  throw error;
};
const guardPaths = (original, indices) => function guarded(...args) {
  if (indices.some((index) => insideOutput(args[index]))) deny();
  return original.apply(this, args);
};

const guardedApis = {
  appendFile: [0],
  copyFile: [1],
  cp: [1],
  link: [1],
  open: [0],
  rename: [1],
  symlink: [1],
  truncate: [0],
  writeFile: [0],
};
for (const [name, indices] of Object.entries(guardedApis)) {
  if (typeof fs.promises[name] === "function") {
    fs.promises[name] = guardPaths(fs.promises[name], indices);
  }
  if (typeof fs[name] === "function") {
    fs[name] = guardPaths(fs[name], indices);
  }
}
for (const [name, indices] of Object.entries({
  appendFileSync: [0],
  copyFileSync: [1],
  cpSync: [1],
  linkSync: [1],
  openSync: [0],
  renameSync: [1],
  symlinkSync: [1],
  truncateSync: [0],
  writeFileSync: [0],
})) {
  if (typeof fs[name] === "function") {
    fs[name] = guardPaths(fs[name], indices);
  }
}
const originalCreateWriteStream = fs.createWriteStream;
fs.createWriteStream = function guardedCreateWriteStream(pathname, ...args) {
  if (insideOutput(pathname)) deny();
  return originalCreateWriteStream.call(this, pathname, ...args);
};
