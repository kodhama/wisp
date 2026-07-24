// SPEC-0001 v5: S9-S16, S26-S30 / R10-R18, R31-R36.
import { mkdir, readFile, readdir, symlink, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  LIMITS,
  WispError,
  createRuntime,
  createCanonicalEvent,
  parseBusBytes,
  recoverStaleLock,
  validateStoredEvent,
  validateToolInput,
} from "../src/runtime.ts";
import { currentProcessIdentity } from "../src/process-identity.ts";

const ts = "2026-07-23T12:34:56.789Z";

function command(id = "c1", target = "worker") {
  return {
    v: 1,
    ts,
    run: "run-1",
    agent: "human",
    kind: "command",
    command: { id, type: "steer", target, payload: { text: "go", nested: [null, true, 3] } },
  };
}

async function project(): Promise<string> {
  return mkdtemp(join(tmpdir(), "wisp-runtime-"));
}

describe("SPEC-0001 S12/S30 — exact validation", () => {
  it("counts UTF-8 bytes, trims identifiers, and rejects null/unknown/control values", () => {
    expect(validateToolInput("wisp_check", { run: " run ", agent: "agent" })).toEqual({
      run: "run",
      agent: "agent",
    });
    expect(() =>
      validateToolInput("wisp_check", { run: "é".repeat(65), agent: "agent" }),
    ).toThrowError(expect.objectContaining({ code: "invalid_input", details: { field: "/run", reason: "too_long", limit: 128, actual: 130 } }));
    expect(() => validateToolInput("wisp_check", { run: null, agent: "agent" })).toThrowError(
      expect.objectContaining({ details: expect.objectContaining({ field: "/run", reason: "null_not_allowed" }) }),
    );
    expect(() => validateToolInput("wisp_check", { run: "r", agent: "a", extra: true })).toThrowError(
      expect.objectContaining({ details: expect.objectContaining({ field: "/extra", reason: "unknown_property" }) }),
    );
    expect(() => validateToolInput("wisp_check", { run: "r\nx", agent: "a" })).toThrowError(
      expect.objectContaining({ details: expect.objectContaining({ field: "/run", reason: "control_character" }) }),
    );
  });

  it("validates exact stored-event fields, timestamp calendar validity, and nested JSON payload", () => {
    expect(validateStoredEvent(command())).toEqual(command());
    for (const value of [
      { ...command(), v: 2 },
      { ...command(), ts: "2026-02-30T12:34:56.789Z" },
      { ...command(), unknown: true },
      { ...command(), command: { ...command().command, target: null } },
      { ...command(), kind: "heartbeat", command: command().command },
    ]) {
      expect(() => validateStoredEvent(value)).toThrowError(WispError);
    }
  });

  it("enforces reference boundaries without code-point/byte confusion", () => {
    const refs = Array.from({ length: LIMITS.references }, (_, i) => `r${i}`);
    expect(validateToolInput("wisp_status", { run: "r", agent: "a", state: "working", refs })).toMatchObject({ refs });
    expect(() =>
      validateToolInput("wisp_status", { run: "r", agent: "a", state: "working", refs: [...refs, "overflow"] }),
    ).toThrowError(expect.objectContaining({ details: expect.objectContaining({ field: "/refs", reason: "too_many" }) }));
    expect(() =>
      validateToolInput("wisp_status", { run: "r", agent: "a", state: "working", refs: [] }),
    ).toThrowError(expect.objectContaining({ details: expect.objectContaining({ field: "/refs", reason: "blank" }) }));
  });

  it("accepts via without to and stores it as meta.via", async () => {
    const root = await project();
    const event = await createRuntime(root, () => new Date(ts)).status({
      run: "r",
      agent: "a",
      state: "working",
      via: "dispatcher",
    });
    expect(event).toMatchObject({ meta: { via: "dispatcher" } });
    expect(event.to).toBeUndefined();
  });

  it("maps generated serialized overflow to event_too_large", () => {
    expect(() =>
      createCanonicalEvent(
        {
          run: "r",
          agent: "a",
          kind: "command",
          command: {
            id: "huge",
            type: "steer",
            target: "a",
            payload: { value: "x".repeat(LIMITS.event) },
          },
        },
        () => new Date(ts),
      ),
    ).toThrowError(expect.objectContaining({
      code: "invalid_input",
      details: expect.objectContaining({ field: "", reason: "event_too_large" }),
    }));
  });
});

describe("SPEC-0001 S9/S10/S26/S27 — confined filesystem and deterministic decoding", () => {
  it("reads a missing bus without creating it and creates exactly one line on first write", async () => {
    const root = await project();
    const runtime = createRuntime(root, () => new Date(ts));
    expect(await runtime.check({ run: "run-1", agent: "worker" })).toEqual({
      commands: [],
      parse_errors: [],
    });
    await expect(readFile(join(root, ".wisp/events.ndjson"))).rejects.toMatchObject({ code: "ENOENT" });
    const event = await runtime.status({ run: "run-1", agent: "worker", state: "working", activity: " actual " });
    const stored = await readFile(join(root, ".wisp/events.ndjson"), "utf8");
    expect(stored).toBe(`${JSON.stringify(event)}\n`);
    expect(event.activity).toBe("actual");
  });

  it("uses fatal UTF-8 and exact LF/CR/final/blank behavior", () => {
    expect(() => parseBusBytes(Uint8Array.from([0xc3, 0x28]))).toThrowError(
      expect.objectContaining({ code: "bus_unreadable", details: expect.objectContaining({ reason: "invalid_utf8" }) }),
    );
    const parsed = parseBusBytes(Buffer.from(`${JSON.stringify(command())}\r\n\n \nnot-json`, "utf8"));
    expect(parsed.events).toHaveLength(1);
    expect(parsed.parse_errors).toEqual([
      { line: 3, reason: "invalid_json", raw: " " },
      { line: 4, reason: "invalid_json", raw: "not-json" },
    ]);
  });

  it("rejects symlink and wrong-type owned paths", async () => {
    const root = await project();
    const outside = await project();
    await symlink(outside, join(root, ".wisp"));
    await expect(createRuntime(root).check({ run: "r", agent: "a" })).rejects.toMatchObject({
      code: "bus_unreadable",
      details: expect.objectContaining({ reason: "path_is_symlink" }),
    });

    const root2 = await project();
    await mkdir(join(root2, ".wisp"));
    await mkdir(join(root2, ".wisp/events.ndjson"));
    await expect(createRuntime(root2).check({ run: "r", agent: "a" })).rejects.toMatchObject({
      code: "bus_unreadable",
      details: expect.objectContaining({ reason: "path_not_regular_file" }),
    });
  });
});

describe("SPEC-0001 S14-S16/S29 — deterministic command safety", () => {
  it("returns targeted pending commands in append order and later same-run acknowledgements win", async () => {
    const root = await project();
    await mkdir(join(root, ".wisp"));
    const events = [
      { ...command("before"), kind: "command_ack", command: undefined, ack: { commandId: "c1", result: "completed" } },
      command("c1"),
      command("c2", "other"),
      { v: 1, ts, run: "other-run", agent: "worker", kind: "command_ack", ack: { commandId: "c1", result: "completed" } },
    ];
    await writeFile(join(root, ".wisp/events.ndjson"), events.map((e) => JSON.stringify(e)).join("\n"));
    const result = await createRuntime(root).check({ run: "run-1", agent: "worker" });
    expect(result.commands).toEqual([
      {
        id: "c1",
        type: "steer",
        target: "worker",
        issued_by: "human",
        issued_at: ts,
        status: "pending",
        payload: { text: "go", nested: [null, true, 3] },
      },
    ]);
  });

  it("fails a whole check on the first duplicate command id and appends nothing on unauthorized ack", async () => {
    const root = await project();
    await mkdir(join(root, ".wisp"));
    const path = join(root, ".wisp/events.ndjson");
    const original = [command("first"), command("ok"), command("first"), command("ok")].map((e) => JSON.stringify(e)).join("\n");
    await writeFile(path, original);
    const runtime = createRuntime(root);
    await expect(runtime.check({ run: "run-1", agent: "worker" })).rejects.toMatchObject({
      code: "command_conflict",
      details: { command_id: "first", count: 2 },
    });
    await expect(runtime.ack({ run: "run-1", agent: "worker", command_id: "first", result: "accepted" })).rejects.toMatchObject({
      code: "command_conflict",
    });
    expect(await readFile(path, "utf8")).toBe(original);
  });

  it("authorizes one targeted pending command and rejects missing/nonpending/other-target commands", async () => {
    const root = await project();
    await mkdir(join(root, ".wisp"));
    const path = join(root, ".wisp/events.ndjson");
    await writeFile(path, `${JSON.stringify(command("c1"))}\n${JSON.stringify(command("c2", "other"))}\n`);
    const runtime = createRuntime(root, () => new Date(ts));
    await expect(runtime.ack({ run: "run-1", agent: "worker", command_id: "missing" })).rejects.toMatchObject({ code: "command_not_found" });
    await expect(runtime.ack({ run: "run-1", agent: "worker", command_id: "c2" })).rejects.toMatchObject({ code: "command_not_targeted" });
    const ack = await runtime.ack({ run: "run-1", agent: "worker", command_id: "c1", note: " handled " });
    expect(ack).toMatchObject({ kind: "command_ack", ack: { commandId: "c1", result: "accepted", note: "handled" } });
    await expect(runtime.ack({ run: "run-1", agent: "worker", command_id: "c1" })).rejects.toMatchObject({
      code: "command_not_pending",
      details: expect.objectContaining({ status: "accepted" }),
    });
  });

  it("ack ignores duplicate ids unrelated to the requested command", async () => {
    const root = await project();
    await mkdir(join(root, ".wisp"));
    const path = join(root, ".wisp/events.ndjson");
    await writeFile(path, [command("other"), command("wanted"), command("other")].map((event) => JSON.stringify(event)).join("\n") + "\n");
    const ack = await createRuntime(root, () => new Date(ts)).ack({
      run: "run-1",
      agent: "worker",
      command_id: "wanted",
    });
    expect(ack).toMatchObject({ kind: "command_ack", ack: { commandId: "wanted", result: "accepted" } });
  });

  it("serializes concurrent first writes without loss or leaked locks", async () => {
    const root = await project();
    await Promise.all(
      Array.from({ length: 24 }, (_, index) =>
        createRuntime(root, () => new Date(ts)).status({
          run: "race",
          agent: `agent-${index}`,
          state: "working",
        })),
    );
    const lines = (await readFile(join(root, ".wisp/events.ndjson"), "utf8")).trimEnd().split("\n");
    expect(lines).toHaveLength(24);
    await expect(readFile(join(root, ".wisp/write.lock/owner.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("enforces projected bus byte limit before append without changing bytes", async () => {
    const root = await project();
    await mkdir(join(root, ".wisp"));
    const path = join(root, ".wisp/events.ndjson");
    const original = Buffer.alloc(LIMITS.bus, 0x20);
    await writeFile(path, original);
    const before = createHash("sha256").update(original).digest("hex");
    await expect(createRuntime(root).heartbeat({ run: "r", agent: "a" })).rejects.toMatchObject({
      code: "bus_limit_exceeded",
      details: { subject: "bus", unit: "utf8_bytes", limit: LIMITS.bus, actual: expect.any(Number) },
    });
    const afterBytes = await readFile(path);
    expect(afterBytes.byteLength).toBe(LIMITS.bus);
    expect(createHash("sha256").update(afterBytes).digest("hex")).toBe(before);
  });

  it("does not leak descriptors across repeated oversized reads", async () => {
    const root = await project();
    await mkdir(join(root, ".wisp"));
    const path = join(root, ".wisp/events.ndjson");
    await writeFile(path, Buffer.alloc(LIMITS.bus + 1, 0x20));
    const before = process.platform === "win32" ? 0 : (await readdir("/dev/fd")).length;
    const runtime = createRuntime(root);
    for (let index = 0; index < 40; index += 1) {
      await expect(runtime.check({ run: "r", agent: "a" })).rejects.toMatchObject({
        code: "bus_limit_exceeded",
      });
    }
    if (process.platform !== "win32") {
      expect((await readdir("/dev/fd")).length).toBeLessThanOrEqual(before + 2);
    }
  });
});

describe("SPEC-0001 cross-process lock recovery", () => {
  it("never steals an aged lock whose usable owner PID is alive", async () => {
    const root = await project();
    const lock = join(root, ".wisp/write.lock");
    await mkdir(lock, { recursive: true });
    await writeFile(
      join(lock, "owner.json"),
      JSON.stringify({
        token: "00000000-0000-4000-8000-000000000001",
        pid: process.pid,
        process_identity: await currentProcessIdentity(),
        created: 0,
        phase: "held",
      }),
    );
    await recoverStaleLock(lock, join(lock, "owner.json"));
    expect(JSON.parse(await readFile(join(lock, "owner.json"), "utf8"))).toMatchObject({
      token: "00000000-0000-4000-8000-000000000001",
      pid: process.pid,
    });
  });

  it("recovers dead-owner and aged missing-owner locks", async () => {
    const root = await project();
    const first = join(root, ".wisp/write.lock");
    await mkdir(first, { recursive: true });
    await writeFile(
      join(first, "owner.json"),
      JSON.stringify({
        token: "00000000-0000-4000-8000-000000000002",
        pid: 2_147_483_647,
        process_identity: "darwin:1970-01-01T00:00:00",
        created: Date.now(),
        phase: "held",
      }),
    );
    await recoverStaleLock(first, join(first, "owner.json"));
    await expect(readFile(join(first, "owner.json"))).rejects.toMatchObject({ code: "ENOENT" });

    const second = join(root, ".wisp/write.lock");
    await mkdir(second);
    const old = new Date(Date.now() - 180_000);
    await utimes(second, old, old);
    await recoverStaleLock(second, join(second, "owner.json"));
    await expect(readdir(second)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
