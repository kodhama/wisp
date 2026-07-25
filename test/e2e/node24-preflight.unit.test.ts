// SPEC-0001@v11 R28; SPEC-0002@v7 S14 / R17; ADR-0011.
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertNode24Version,
  resolveEntrypoint,
} from "../../scripts/node24-preflight.mjs";
import {
  ESBUILD_NODE_TARGET,
  SUPPORTED_NODE_MAJOR,
} from "../../scripts/node-support.mjs";

describe("SPEC-0002@v7 S14 — Node 24 runtime preflight", () => {
  it("shares one Node support constant with the bundle build", async () => {
    expect(SUPPORTED_NODE_MAJOR).toBe(24);
    expect(ESBUILD_NODE_TARGET).toBe("node24");
    expect(ESBUILD_NODE_TARGET).toBe(`node${SUPPORTED_NODE_MAJOR}`);
    const buildScript = await readFile(
      new URL("../../scripts/build-plugin.mjs", import.meta.url),
      "utf8",
    );
    const preflightScript = await readFile(
      new URL("../../scripts/node24-preflight.mjs", import.meta.url),
      "utf8",
    );
    expect(buildScript).toContain(
      'import { ESBUILD_NODE_TARGET } from "./node-support.mjs";',
    );
    expect(buildScript).toContain("target: ESBUILD_NODE_TARGET");
    expect(preflightScript).toContain(
      'import { SUPPORTED_NODE_MAJOR } from "./node-support.mjs";',
    );
    expect(preflightScript).toContain("major !== SUPPORTED_NODE_MAJOR");
  });

  it("accepts exact Node 24 SemVer output", () => {
    expect(assertNode24Version("v24.16.0")).toBe("v24.16.0");
    expect(assertNode24Version("v24.0.0")).toBe("v24.0.0");
  });

  it.each(["", "24.16.0", "v24", "v24.16", "v24.16.0\n", "v024.16.0", "garbage"])(
    "rejects missing or malformed runtime output %j",
    (version) => {
      expect(() => assertNode24Version(version)).toThrow("invalid Node runtime version");
    },
  );

  it.each(["v20.20.0", "v22.22.0", "v25.0.0"])(
    "rejects unsupported runtime %s before execution",
    (version) => {
      expect(() => assertNode24Version(version)).toThrow(
        `unsupported Node runtime ${version}; expected major 24`,
      );
    },
  );

  it("executes through a symlink and enforces the actual runtime", async () => {
    const root = await mkdtemp(join(tmpdir(), "wisp-node24-preflight-"));
    try {
      const entrypoint = join(root, "node24-preflight.mjs");
      await symlink(
        fileURLToPath(new URL("../../scripts/node24-preflight.mjs", import.meta.url)),
        entrypoint,
      );
      const result = spawnSync(process.execPath, [entrypoint], { encoding: "utf8" });
      const currentMajor = Number(process.versions.node.split(".")[0]);
      expect(result.status).toBe(currentMajor === SUPPORTED_NODE_MAJOR ? 0 : 1);
      expect(result.stdout).toBe(`${process.version}\n`);
      expect(result.stderr).toBe(
        currentMajor === SUPPORTED_NODE_MAJOR
          ? ""
          : `unsupported Node runtime ${process.version}; expected major ${SUPPORTED_NODE_MAJOR}\n`,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails closed when an entrypoint path cannot be canonicalized", () => {
    expect(resolveEntrypoint).toEqual(expect.any(Function));
    expect(() =>
      resolveEntrypoint(
        import.meta.url,
        join(tmpdir(), "missing-wisp-node24-preflight.mjs"),
      )).toThrow(/ENOENT/u);
  });

  it("fails closed through a symlink for a simulated Node 22 runtime", async () => {
    const root = await mkdtemp(join(tmpdir(), "wisp-node22-preflight-"));
    try {
      const entrypoint = join(root, "node24-preflight.mjs");
      const preload = join(root, "node22.mjs");
      await symlink(
        fileURLToPath(new URL("../../scripts/node24-preflight.mjs", import.meta.url)),
        entrypoint,
      );
      await writeFile(
        preload,
        'Object.defineProperty(process, "version", { value: "v22.22.0" });\n',
      );
      const result = spawnSync(
        process.execPath,
        ["--import", pathToFileURL(preload).href, entrypoint],
        { encoding: "utf8" },
      );
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("v22.22.0\n");
      expect(result.stderr).toBe(
        "unsupported Node runtime v22.22.0; expected major 24\n",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
