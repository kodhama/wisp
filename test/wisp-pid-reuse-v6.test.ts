// SPEC-0001 v6: S37/S47 / R63 — deterministic same-PID/new-birth recovery.
import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({
  current: "test-qualified:birth-B",
  gate: undefined as undefined | (() => void),
  waiting: undefined as undefined | Promise<void>,
}));

vi.mock("../src/process-identity.ts", async () => {
  const actual = await vi.importActual<typeof import("../src/process-identity.ts")>(
    "../src/process-identity.ts",
  );
  return {
    ...actual,
    currentProcessIdentity: async () => identity.current,
    observeProcess: async () => {
      if (identity.waiting !== undefined) await identity.waiting;
      return { state: "present" as const, token: identity.current };
    },
  };
});

import { DashboardCoordinator } from "../src/dashboard.ts";
import { recoverStaleLock } from "../src/runtime.ts";

const originalHome = process.env.HOME;

afterEach(() => {
  identity.current = "test-qualified:birth-B";
  identity.gate = undefined;
  identity.waiting = undefined;
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
});

function lockOwner(processIdentity: string, token: string): Record<string, unknown> {
  return {
    token,
    pid: process.pid,
    process_identity: processIdentity,
    created: Date.now(),
    phase: "held",
  };
}

describe("SPEC-0001 v6 deterministic PID-reuse recovery", () => {
  it("quarantines an actual dashboard owner with the same PID and old birth token", async () => {
    const project = await realpath(await mkdtemp(join(tmpdir(), "wisp-pid-dashboard-project-")));
    const home = await realpath(await mkdtemp(join(tmpdir(), "wisp-pid-dashboard-home-")));
    process.env.HOME = home;
    const key = createHash("sha256").update(project, "utf8").digest("hex");
    const ownerDir = join(home, ".wisp/runtime/dashboard", key, "owner");
    await mkdir(ownerDir, { recursive: true, mode: 0o700 });
    for (const path of [
      join(home, ".wisp"),
      join(home, ".wisp/runtime"),
      join(home, ".wisp/runtime/dashboard"),
      join(home, ".wisp/runtime/dashboard", key),
      ownerDir,
    ]) await import("node:fs/promises").then(({ chmod }) => chmod(path, 0o700));
    await writeFile(join(ownerDir, "owner.json"), JSON.stringify({
      schema: 1,
      protocol: 1,
      state: "starting",
      project,
      project_key: key,
      instance: "00000000-0000-4000-8000-000000000001",
      pid: process.pid,
      process_identity: "test-qualified:birth-A",
      created_at: "2026-07-24T12:00:00.000Z",
    }), { mode: 0o600 });

    const coordinator = new DashboardCoordinator(project);
    const result = await coordinator.start();
    expect(result.reused).toBe(false);
    const replacement = JSON.parse(await readFile(join(ownerDir, "owner.json"), "utf8")) as {
      process_identity: string;
    };
    expect(replacement.process_identity).toBe("test-qualified:birth-B");
    await coordinator.cleanup();
  });

  it("quarantines an actual bus lock with the same PID and old birth token", async () => {
    const root = await mkdtemp(join(tmpdir(), "wisp-pid-bus-"));
    const lock = join(root, ".wisp/write.lock");
    await mkdir(lock, { recursive: true, mode: 0o700 });
    await writeFile(
      join(lock, "owner.json"),
      JSON.stringify(lockOwner("test-qualified:birth-A", "00000000-0000-4000-8000-000000000001")),
      { mode: 0o600 },
    );

    await recoverStaleLock(lock, join(lock, "owner.json"));
    await expect(stat(lock)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not remove a bus record replaced after observation but before quarantine", async () => {
    const root = await mkdtemp(join(tmpdir(), "wisp-pid-bus-race-"));
    const lock = join(root, ".wisp/write.lock");
    const ownerPath = join(lock, "owner.json");
    await mkdir(lock, { recursive: true, mode: 0o700 });
    await writeFile(
      ownerPath,
      JSON.stringify(lockOwner("test-qualified:birth-A", "00000000-0000-4000-8000-000000000001")),
      { mode: 0o600 },
    );
    identity.waiting = new Promise<void>((resolveGate) => { identity.gate = resolveGate; });
    const recovery = recoverStaleLock(lock, ownerPath);
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    const replacement = lockOwner("test-qualified:birth-C", "00000000-0000-4000-8000-000000000002");
    await writeFile(ownerPath, JSON.stringify(replacement), { mode: 0o600 });
    identity.gate?.();
    await recovery;

    expect(JSON.parse(await readFile(ownerPath, "utf8"))).toEqual(replacement);
  });
});
