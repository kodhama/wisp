// SPEC-0001@v14: S37/S47/S70 / R63/R88 — deterministic identity-safe recovery.
import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  stat,
  unlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({
  current: "linux:00000000-0000-4000-8000-000000000001:2",
  observation: undefined as undefined |
    { state: "present"; token: string } |
    { state: "absent" } |
    { state: "inconclusive" },
  gate: undefined as undefined | (() => void),
  waiting: undefined as undefined | Promise<void>,
  observeCalls: 0,
}));

vi.mock("../src/process-identity.ts", async () => {
  const actual = await vi.importActual<typeof import("../src/process-identity.ts")>(
    "../src/process-identity.ts",
  );
  return {
    ...actual,
    currentProcessIdentity: async () => identity.current,
    observeProcess: async () => {
      identity.observeCalls += 1;
      if (identity.waiting !== undefined) await identity.waiting;
      return identity.observation ??
        { state: "present" as const, token: identity.current };
    },
  };
});

import { DashboardCoordinator } from "../src/dashboard.ts";
import { recoverStaleLock } from "../src/runtime.ts";

const originalHome = process.env.HOME;

afterEach(() => {
  identity.current = "linux:00000000-0000-4000-8000-000000000001:2";
  identity.observation = undefined;
  identity.gate = undefined;
  identity.waiting = undefined;
  identity.observeCalls = 0;
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

async function makeLockOld(lock: string): Promise<void> {
  const old = new Date(Date.now() - 180_000);
  await utimes(lock, old, old);
}

describe("SPEC-0001@v14 deterministic PID-reuse recovery", () => {
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
      process_identity: "linux:00000000-0000-4000-8000-000000000001:1",
      created_at: "2026-07-24T12:00:00.000Z",
    }), { mode: 0o600 });

    const coordinator = new DashboardCoordinator(project);
    const result = await coordinator.start();
    expect(result.reused).toBe(false);
    const replacement = JSON.parse(await readFile(join(ownerDir, "owner.json"), "utf8")) as {
      process_identity: string;
    };
    expect(replacement.process_identity).toBe(
      "linux:00000000-0000-4000-8000-000000000001:2",
    );
    await coordinator.cleanup();
  });

  it("quarantines an actual bus lock with the same PID and old birth token", async () => {
    const root = await mkdtemp(join(tmpdir(), "wisp-pid-bus-"));
    const lock = join(root, ".wisp/write.lock");
    await mkdir(lock, { recursive: true, mode: 0o700 });
    await writeFile(
      join(lock, "owner.json"),
      JSON.stringify(lockOwner(
        "linux:00000000-0000-4000-8000-000000000001:1",
        "00000000-0000-4000-8000-000000000001",
      )),
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
      JSON.stringify(lockOwner(
        "linux:00000000-0000-4000-8000-000000000001:1",
        "00000000-0000-4000-8000-000000000001",
      )),
      { mode: 0o600 },
    );
    identity.waiting = new Promise<void>((resolveGate) => { identity.gate = resolveGate; });
    const recovery = recoverStaleLock(lock, ownerPath);
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    const replacement = lockOwner(
      "linux:00000000-0000-4000-8000-000000000001:3",
      "00000000-0000-4000-8000-000000000002",
    );
    await writeFile(ownerPath, JSON.stringify(replacement), { mode: 0o600 });
    identity.gate?.();
    await recovery;

    expect(JSON.parse(await readFile(ownerPath, "utf8"))).toEqual(replacement);
  });

  it("treats a non-qualified identity as malformed and never retires it by committed phase while fresh", async () => {
    const root = await mkdtemp(join(tmpdir(), "wisp-nonqualified-fresh-"));
    const lock = join(root, ".wisp/write.lock");
    const ownerPath = join(lock, "owner.json");
    await mkdir(lock, { recursive: true, mode: 0o700 });
    const owner = {
      ...lockOwner(
        "test-qualified:birth-B",
        "00000000-0000-4000-8000-000000000001",
      ),
      phase: "committed",
    };
    await writeFile(ownerPath, JSON.stringify(owner), { mode: 0o600 });
    identity.current = "test-qualified:birth-B";

    await recoverStaleLock(lock, ownerPath);

    expect(JSON.parse(await readFile(ownerPath, "utf8"))).toEqual(owner);
    expect(identity.observeCalls).toBe(0);
  });

  it("recovers an aged non-qualified identity only through ownerless age", async () => {
    const root = await mkdtemp(join(tmpdir(), "wisp-nonqualified-aged-"));
    const lock = join(root, ".wisp/write.lock");
    const ownerPath = join(lock, "owner.json");
    await mkdir(lock, { recursive: true, mode: 0o700 });
    await writeFile(ownerPath, JSON.stringify({
      ...lockOwner(
        "test-qualified:birth-B",
        "00000000-0000-4000-8000-000000000001",
      ),
      created: 0,
      phase: "committed",
    }), { mode: 0o600 });

    await recoverStaleLock(lock, ownerPath);

    await expect(stat(lock)).rejects.toMatchObject({ code: "ENOENT" });
    expect(identity.observeCalls).toBe(0);
  });

  it("accepts a finite non-negative integer created value beyond the safe-integer range", async () => {
    const root = await mkdtemp(join(tmpdir(), "wisp-created-integer-"));
    const lock = join(root, ".wisp/write.lock");
    const ownerPath = join(lock, "owner.json");
    const processIdentity =
      "linux:00000000-0000-4000-8000-000000000001:1";
    await mkdir(lock, { recursive: true, mode: 0o700 });
    await writeFile(ownerPath, JSON.stringify({
      ...lockOwner(
        processIdentity,
        "00000000-0000-4000-8000-000000000001",
      ),
      created: 9_007_199_254_740_992,
      phase: "committed",
    }), { mode: 0o600 });
    identity.observation = { state: "present", token: processIdentity };

    await recoverStaleLock(lock, ownerPath);

    await expect(stat(lock)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each([
    ["same token", { state: "present", token: "linux:00000000-0000-4000-8000-000000000001:1" }],
    ["inconclusive", { state: "inconclusive" }],
  ] as const)("keeps a malformed owner with usable identity on %s observation", async (
    _label,
    observation,
  ) => {
    const root = await mkdtemp(join(tmpdir(), "wisp-malformed-live-"));
    const lock = join(root, ".wisp/write.lock");
    const ownerPath = join(lock, "owner.json");
    await mkdir(lock, { recursive: true, mode: 0o700 });
    const owner = {
      ...lockOwner(
        "linux:00000000-0000-4000-8000-000000000001:1",
        "00000000-0000-4000-8000-000000000001",
      ),
      unexpected: true,
    };
    await writeFile(ownerPath, JSON.stringify(owner), { mode: 0o600 });
    identity.observation = observation;

    await recoverStaleLock(lock, ownerPath);

    expect(JSON.parse(await readFile(ownerPath, "utf8"))).toEqual(owner);
  });

  it.each([
    ["absent", { state: "absent" }],
    ["different token", {
      state: "present",
      token: "linux:00000000-0000-4000-8000-000000000001:2",
    }],
  ] as const)("recovers a malformed owner with usable identity on %s observation", async (
    _label,
    observation,
  ) => {
    const root = await mkdtemp(join(tmpdir(), "wisp-malformed-dead-"));
    const lock = join(root, ".wisp/write.lock");
    const ownerPath = join(lock, "owner.json");
    await mkdir(lock, { recursive: true, mode: 0o700 });
    await writeFile(ownerPath, JSON.stringify({
      ...lockOwner(
        "linux:00000000-0000-4000-8000-000000000001:1",
        "00000000-0000-4000-8000-000000000001",
      ),
      unexpected: true,
    }), { mode: 0o600 });
    identity.observation = observation;

    await recoverStaleLock(lock, ownerPath);

    await expect(stat(lock)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("requires byte-for-byte equality after observing a malformed owner", async () => {
    const root = await mkdtemp(join(tmpdir(), "wisp-malformed-race-"));
    const lock = join(root, ".wisp/write.lock");
    const ownerPath = join(lock, "owner.json");
    await mkdir(lock, { recursive: true, mode: 0o700 });
    const owner = {
      ...lockOwner(
        "linux:00000000-0000-4000-8000-000000000001:1",
        "00000000-0000-4000-8000-000000000001",
      ),
      unexpected: true,
    };
    await writeFile(ownerPath, JSON.stringify(owner), { mode: 0o600 });
    identity.observation = { state: "absent" };
    identity.waiting = new Promise<void>((resolveGate) => {
      identity.gate = resolveGate;
    });
    const recovery = recoverStaleLock(lock, ownerPath);
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    const replacement = JSON.stringify({ ...owner, unexpected: false });
    await writeFile(ownerPath, replacement, { mode: 0o600 });
    identity.gate?.();

    await recovery;

    expect(await readFile(ownerPath, "utf8")).toBe(replacement);
  });

  it("recovers unchanged syntactically invalid raw owner bytes only after ownerless age", async () => {
    const root = await mkdtemp(join(tmpdir(), "wisp-invalid-raw-"));
    const lock = join(root, ".wisp/write.lock");
    const ownerPath = join(lock, "owner.json");
    await mkdir(lock, { recursive: true, mode: 0o700 });
    await writeFile(ownerPath, Buffer.from([0xff, 0xfe]), { mode: 0o600 });
    await makeLockOld(lock);

    await recoverStaleLock(lock, ownerPath);

    await expect(stat(lock)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("fails closed when an owner appears after an owner-missing snapshot", async () => {
    const root = await mkdtemp(join(tmpdir(), "wisp-missing-present-"));
    const lock = join(root, ".wisp/write.lock");
    const ownerPath = join(lock, "owner.json");
    const appeared = Buffer.from("{invalid");
    await mkdir(lock, { recursive: true, mode: 0o700 });
    await makeLockOld(lock);
    await recoverStaleLock(lock, ownerPath, {
      beforeReread: async () => {
        await writeFile(ownerPath, appeared, { mode: 0o600 });
      },
    });

    expect(await readFile(ownerPath)).toEqual(appeared);
  });

  it("fails closed when a present malformed owner disappears before reread", async () => {
    const root = await mkdtemp(join(tmpdir(), "wisp-present-missing-"));
    const lock = join(root, ".wisp/write.lock");
    const ownerPath = join(lock, "owner.json");
    await mkdir(lock, { recursive: true, mode: 0o700 });
    await writeFile(ownerPath, Buffer.from([0xff, 0xfe]), { mode: 0o600 });
    await makeLockOld(lock);
    await recoverStaleLock(lock, ownerPath, {
      beforeReread: async () => {
        await unlink(ownerPath);
      },
    });

    expect((await stat(lock)).isDirectory()).toBe(true);
    await expect(readFile(ownerPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("fails closed when syntactically invalid owner bytes change before reread", async () => {
    const root = await mkdtemp(join(tmpdir(), "wisp-invalid-byte-race-"));
    const lock = join(root, ".wisp/write.lock");
    const ownerPath = join(lock, "owner.json");
    const replacement = Buffer.from([0xff, 0xfd]);
    await mkdir(lock, { recursive: true, mode: 0o700 });
    await writeFile(ownerPath, Buffer.from([0xff, 0xfe]), { mode: 0o600 });
    await makeLockOld(lock);
    await recoverStaleLock(lock, ownerPath, {
      beforeReread: async () => {
        await writeFile(ownerPath, replacement, { mode: 0o600 });
      },
    });

    expect(await readFile(ownerPath)).toEqual(replacement);
  });
});
