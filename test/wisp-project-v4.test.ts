// SPEC-0001 v4: S1, S3-S8, S21 / R4-R9, R27.
import { mkdtemp, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { ProjectResolver } from "../src/project.ts";

async function root(): Promise<string> {
  return mkdtemp(join(tmpdir(), "wisp-project-"));
}

describe("SPEC-0001 S1/S3-S8 — immutable project resolution", () => {
  it("selects and canonicalizes a valid explicit root without listing roots", async () => {
    const target = await root();
    const listRoots = vi.fn();
    const resolver = new ProjectResolver(target, true, listRoots);
    await expect(resolver.resolve()).resolves.toBe(await realpath(target));
    expect(listRoots).not.toHaveBeenCalled();
  });

  it.each(["", "relative", "/definitely/missing/wisp"])(
    "rejects invalid explicit root %j without fallback",
    async (value) => {
      const listRoots = vi.fn();
      const resolver = new ProjectResolver(value, true, listRoots);
      await expect(resolver.resolve()).rejects.toMatchObject({
        code: "project_unresolved",
        details: { reason: "invalid_environment_root", source: "environment" },
      });
      expect(listRoots).not.toHaveBeenCalled();
    },
  );

  it("distinguishes unsupported, failed, absent, ambiguous, and invalid roots", async () => {
    await expect(new ProjectResolver(undefined, false, vi.fn()).resolve()).rejects.toMatchObject({
      details: { reason: "roots_unsupported", source: "roots" },
    });
    await expect(new ProjectResolver(undefined, true, vi.fn().mockRejectedValue(new Error("no"))).resolve()).rejects.toMatchObject({
      details: { reason: "roots_list_failed", source: "roots" },
    });
    await expect(new ProjectResolver(undefined, true, vi.fn().mockResolvedValue([])).resolve()).rejects.toMatchObject({
      details: { reason: "roots_absent", source: "roots" },
    });
    await expect(new ProjectResolver(undefined, true, vi.fn().mockResolvedValue([{ uri: "file:///a" }, { uri: "file:///b" }])).resolve()).rejects.toMatchObject({
      details: { reason: "roots_ambiguous", source: "roots" },
    });
    await expect(new ProjectResolver(undefined, true, vi.fn().mockResolvedValue([{ uri: "https://example.com" }])).resolve()).rejects.toMatchObject({
      details: { reason: "invalid_file_root", source: "roots" },
    });
  });

  it("uses exactly one local file root and memoizes success and failure", async () => {
    const target = await root();
    const listRoots = vi.fn().mockResolvedValue([{ uri: pathToFileURL(target).href }]);
    const resolver = new ProjectResolver(undefined, true, listRoots);
    expect(await resolver.resolve()).toBe(await realpath(target));
    expect(await resolver.resolve()).toBe(await realpath(target));
    expect(listRoots).toHaveBeenCalledTimes(1);

    const failedList = vi.fn().mockResolvedValue([]);
    const failed = new ProjectResolver(undefined, true, failedList);
    await expect(failed.resolve()).rejects.toMatchObject({ details: expect.objectContaining({ reason: "roots_absent" }) });
    failedList.mockResolvedValue([{ uri: pathToFileURL(target).href }]);
    await expect(failed.resolve()).rejects.toMatchObject({ details: expect.objectContaining({ reason: "roots_absent" }) });
    expect(failedList).toHaveBeenCalledTimes(1);
  });

  it("rejects query, fragment, authority, missing file, and non-directory file roots", async () => {
    const target = await root();
    const file = join(target, "file");
    await writeFile(file, "x");
    for (const uri of [
      `${pathToFileURL(target).href}?q=1`,
      `${pathToFileURL(target).href}#f`,
      "file://remotehost/tmp",
      pathToFileURL(join(target, "missing")).href,
      pathToFileURL(file).href,
    ]) {
      await expect(new ProjectResolver(undefined, true, vi.fn().mockResolvedValue([{ uri }])).resolve()).rejects.toMatchObject({
        details: { reason: "invalid_file_root", source: "roots" },
      });
    }
  });

  it("SPEC-0001 root selection canonicalizes a symlink to a real directory", async () => {
    const parent = await root();
    const target = await root();
    const linked = join(parent, "linked-project");
    await symlink(target, linked);
    await expect(new ProjectResolver(linked, true, vi.fn()).resolve()).resolves.toBe(await realpath(target));
  });
});
