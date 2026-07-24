// SPEC-0001 v6: S37/S52 / R63/R69 — exact parser fixtures and live identity evidence.
import { spawn, type ChildProcess } from "node:child_process";
import {
  currentProcessIdentity,
  observeProcess,
  parseDarwinIdentity,
  parseLinuxIdentity,
  processInstanceIsGone,
} from "../src/process-identity.ts";
import { afterEach, describe, expect, it } from "vitest";

const children: ChildProcess[] = [];
const BOOT_ID = "123e4567-e89b-42d3-a456-426614174000";

afterEach(async () => {
  await Promise.all(
    children.splice(0).map(async (child) => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
      if (child.exitCode === null && child.signalCode === null) {
        await new Promise<void>((resolve) => child.once("close", () => resolve()));
      }
    }),
  );
});

function linuxStat(pid: number, comm: string, starttime: string): string {
  const fields = Array.from({ length: 20 }, () => "0");
  fields[0] = "S";
  fields[19] = starttime;
  return `${pid} (${comm}) ${fields.join(" ")}`;
}

describe("SPEC-0001 v6 exact qualified process identities", () => {
  it("classifies deterministic same-PID/new-token evidence for dashboard and bus recovery", () => {
    expect(processInstanceIsGone("birth-A", { state: "present", token: "birth-B" })).toBe(true);
    expect(processInstanceIsGone("birth-A", { state: "present", token: "birth-A" })).toBe(false);
    expect(processInstanceIsGone("birth-A", { state: "absent" })).toBe(true);
    expect(processInstanceIsGone("birth-A", { state: "inconclusive" })).toBeUndefined();
  });
  it("parses Linux boot/start identity with spaces and closing parentheses in comm", () => {
    expect(parseLinuxIdentity(BOOT_ID, linuxStat(321, "worker with ) marks", "987654"), 321))
      .toBe(`linux:${BOOT_ID}:987654`);
    expect(parseLinuxIdentity(`${BOOT_ID}\n`, linuxStat(321, "plain", "0"), 321))
      .toBe(`linux:${BOOT_ID}:0`);
  });

  it.each([
    ["uppercase boot ID", BOOT_ID.toUpperCase(), linuxStat(321, "worker", "1"), 321],
    ["malformed boot ID", "not-a-uuid", linuxStat(321, "worker", "1"), 321],
    ["wrong PID prefix", BOOT_ID, linuxStat(322, "worker", "1"), 321],
    ["missing close delimiter", BOOT_ID, "321 (worker S 0 0 0", 321],
    ["short stat", BOOT_ID, "321 (worker) S 0 0", 321],
    ["non-decimal start ticks", BOOT_ID, linuxStat(321, "worker", "-1"), 321],
  ])("rejects Linux %s", (_name, boot, stat, pid) => {
    expect(parseLinuxIdentity(boot, stat, pid)).toBeUndefined();
  });

  it("parses every macOS month and both day widths into the canonical token", () => {
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    for (const [index, month] of months.entries()) {
      const day = index % 2 === 0 ? " 1" : "21";
      const expectedDay = day.trim().padStart(2, "0");
      expect(parseDarwinIdentity(`Mon ${month} ${day} 02:03:04 2024\n`)).toBe(
        `darwin:2024-${String(index + 1).padStart(2, "0")}-${expectedDay}T02:03:04`,
      );
    }
  });

  it.each([
    ["locale-dependent text", "Lun Jan  1 02:03:04 2024"],
    ["impossible date", "Mon Feb 30 02:03:04 2024"],
    ["invalid hour", "Mon Jan  1 24:03:04 2024"],
    ["invalid minute", "Mon Jan  1 02:60:04 2024"],
    ["multiple lines", "Mon Jan  1 02:03:04 2024\nTue Jan  2 02:03:04 2024"],
    ["trailing evidence", "Mon Jan  1 02:03:04 2024 unexpected"],
    ["blank", ""],
  ])("rejects macOS %s", (_name, value) => {
    expect(parseDarwinIdentity(value)).toBeUndefined();
  });

  it.runIf(process.platform === "darwin" || process.platform === "linux")(
    "repeats the current identity, distinguishes a live child, and observes it absent after exit",
    async () => {
      const first = await currentProcessIdentity();
      const second = await currentProcessIdentity();
      expect(first).toMatch(new RegExp(`^${process.platform}:`, "u"));
      expect(second).toBe(first);

      // macOS lstart has one-second precision. Keep the child concurrently
      // live but start it in a later observable tick so the exact provider
      // can furnish the distinct-token evidence required by the spec.
      const startingSecond = Math.floor(Date.now() / 1_000);
      while (Math.floor(Date.now() / 1_000) === startingSecond) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
        stdio: "ignore",
      });
      children.push(child);
      await new Promise<void>((resolve, reject) => {
        child.once("spawn", resolve);
        child.once("error", reject);
      });
      expect(child.pid).toEqual(expect.any(Number));
      const live = await observeProcess(child.pid!);
      expect(live).toMatchObject({ state: "present", token: expect.any(String) });
      if (live.state === "present") expect(live.token).not.toBe(first);

      child.kill("SIGTERM");
      await new Promise<void>((resolve) => child.once("close", () => resolve()));
      expect(await observeProcess(child.pid!)).toEqual({ state: "absent" });
    },
  );
});
