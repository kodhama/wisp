// SPEC-0001 v6: S51 / R66-R67 — post-commit success, bounded release retry, and redacted diagnostics.
import { join } from "node:path";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

const faults = vi.hoisted(() => ({
  phaseFailuresRemaining: 0,
  phaseAttempts: 0,
  releaseFailuresRemaining: 0,
  releaseAttempts: 0,
}));

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>(
    "node:fs/promises",
  );
  return {
    ...actual,
    rename: async (from: Parameters<typeof actual.rename>[0], to: Parameters<typeof actual.rename>[1]) => {
      const source = String(from);
      const destination = String(to);
      if (source.includes("/write.lock/owner.json.tmp-") &&
        destination.endsWith("/write.lock/owner.json")) {
        faults.phaseAttempts += 1;
        if (faults.phaseFailuresRemaining > 0) {
          faults.phaseFailuresRemaining -= 1;
          throw Object.assign(new Error("injected phase publication failure"), {
            code: "EIO",
          });
        }
      }
      if (source.endsWith("/write.lock") && destination.includes("/write.lock.retired-")) {
        faults.releaseAttempts += 1;
        if (faults.releaseFailuresRemaining > 0) {
          faults.releaseFailuresRemaining -= 1;
          throw Object.assign(new Error("injected canonical release failure"), {
            code: "EIO",
          });
        }
      }
      return actual.rename(from, to);
    },
  };
});

vi.mock("../src/process-identity.ts", async () => {
  const actual = await vi.importActual<typeof import("../src/process-identity.ts")>(
    "../src/process-identity.ts",
  );
  const token = "test-qualified-process:2026-07-24T12:00:00";
  return {
    ...actual,
    currentProcessIdentity: async () => token,
    observeProcess: async () => ({ state: "present" as const, token }),
  };
});

import {
  createRuntime,
  hasCommittedTokenForTesting,
  setCommittedReleaseHorizonForTesting,
} from "../src/runtime.ts";

afterEach(() => {
  faults.phaseFailuresRemaining = 0;
  faults.phaseAttempts = 0;
  faults.releaseFailuresRemaining = 0;
  faults.releaseAttempts = 0;
  vi.restoreAllMocks();
  setCommittedReleaseHorizonForTesting(5_000);
});

async function oneCommittedEvent(root: string): Promise<unknown> {
  const event = await createRuntime(root, () => new Date("2026-07-24T12:00:00.000Z"))
    .status({
      run: "post-commit",
      agent: "secret-agent-name",
      state: "working",
    });
  const lines = (await readFile(join(root, ".wisp/events.ndjson"), "utf8"))
    .trimEnd()
    .split("\n");
  expect(lines).toHaveLength(1);
  expect(JSON.parse(lines[0]!)).toEqual(event);
  return event;
}

function diagnosticText(write: { mock: { calls: readonly (readonly unknown[])[] } }): string {
  return write.mock.calls.map((call) => String(call[0])).join("");
}

describe("SPEC-0001 v6 irreversible append commit", () => {
  it("retries committed-phase publication yet returns the one committed event with one redacted diagnostic", async () => {
    const root = await mkdtemp(join(tmpdir(), "wisp-phase-publish-"));
    faults.phaseFailuresRemaining = 2;
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await oneCommittedEvent(root);

    expect.soft(faults.phaseAttempts).toBeGreaterThanOrEqual(3);
    const diagnostic = diagnosticText(stderr);
    expect.soft(diagnostic).toContain("phase_publish");
    expect.soft(diagnostic).toMatch(/[0-9a-f]{8}-[0-9a-f-]{27}/u);
    expect.soft(diagnostic).not.toContain(root);
    expect.soft(diagnostic).not.toContain("secret-agent-name");
    expect.soft(diagnostic).not.toContain(String(process.pid));
  });

  it("retries canonical release yet returns the one committed event with one redacted diagnostic", async () => {
    const root = await mkdtemp(join(tmpdir(), "wisp-release-rename-"));
    faults.releaseFailuresRemaining = 2;
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await oneCommittedEvent(root);

    expect.soft(faults.releaseAttempts).toBeGreaterThanOrEqual(3);
    const diagnostic = diagnosticText(stderr);
    expect.soft(diagnostic).toContain("release_rename");
    expect.soft(diagnostic).toMatch(/[0-9a-f]{8}-[0-9a-f-]{27}/u);
    expect.soft(diagnostic).not.toContain(root);
    expect.soft(diagnostic).not.toContain("secret-agent-name");
    expect.soft(diagnostic).not.toContain(String(process.pid));
  });

  it("expires process-local committed-token privilege after the configured horizon", async () => {
    const root = await mkdtemp(join(tmpdir(), "wisp-release-horizon-"));
    faults.releaseFailuresRemaining = 10_000;
    setCommittedReleaseHorizonForTesting(25);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await oneCommittedEvent(root);
    const owner = JSON.parse(
      await readFile(join(root, ".wisp/write.lock/owner.json"), "utf8"),
    ) as { token: string };
    expect(hasCommittedTokenForTesting(owner.token)).toBe(true);

    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    expect(hasCommittedTokenForTesting(owner.token)).toBe(false);
  });
});
