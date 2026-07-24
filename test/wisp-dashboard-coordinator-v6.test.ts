// SPEC-0001 v7: S35, S36, S49 / R43, R59 — dashboard acquisition, health, and recheck.
import { createHash } from "node:crypto";
import { join } from "node:path";
import { mkdtemp, readFile, realpath, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

const seam = vi.hoisted(() => ({
  replaceAfterAcquisition: false,
  transientMissingDirectory: undefined as string | undefined,
  transientMissingObserved: false,
}));

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>(
    "node:fs/promises",
  );
  return {
    ...actual,
    lstat: async (path: Parameters<typeof actual.lstat>[0]) => {
      if (String(path) === seam.transientMissingDirectory) {
        seam.transientMissingDirectory = undefined;
        seam.transientMissingObserved = true;
        throw Object.assign(new Error("transiently absent owner directory"), {
          code: "ENOENT",
        });
      }
      return await actual.lstat(path);
    },
    rename: async (from: Parameters<typeof actual.rename>[0], to: Parameters<typeof actual.rename>[1]) => {
      await actual.rename(from, to);
      const source = String(from);
      const destination = String(to);
      if (seam.replaceAfterAcquisition &&
        source.includes(".candidate-") &&
        destination.endsWith("/owner")) {
        seam.replaceAfterAcquisition = false;
        const ownerPath = join(destination, "owner.json");
        const owner = JSON.parse(await actual.readFile(ownerPath, "utf8")) as Record<string, unknown>;
        await actual.writeFile(ownerPath, JSON.stringify({ ...owner, protocol: 2 }), {
          mode: 0o600,
        });
      }
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

import { DashboardCoordinator } from "../src/dashboard.ts";
import { callWispTool } from "../src/mcp.ts";
import { createRuntime } from "../src/runtime.ts";

const originalHome = process.env.HOME;

afterEach(() => {
  seam.replaceAfterAcquisition = false;
  seam.transientMissingDirectory = undefined;
  seam.transientMissingObserved = false;
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SPEC-0001 v7 dashboard acquisition and post-acquisition recheck", () => {
  it("issue #38 treats an owner published after an absent probe as convergence, not runtime_unsafe", async () => {
    const project = await realpath(
      await mkdtemp(join(tmpdir(), "wisp-dashboard-owner-appeared-project-")),
    );
    const home = await realpath(
      await mkdtemp(join(tmpdir(), "wisp-dashboard-owner-appeared-home-")),
    );
    process.env.HOME = home;
    const publisher = new DashboardCoordinator(project);
    const follower = new DashboardCoordinator(project);
    const published = await publisher.start();
    seam.transientMissingDirectory = join(
      home,
      ".wisp/runtime/dashboard",
      createHash("sha256").update(project, "utf8").digest("hex"),
      "owner",
    );

    try {
      await expect(follower.start()).resolves.toEqual({
        url: published.url,
        reused: true,
      });
      expect(seam.transientMissingObserved).toBe(true);
    } finally {
      await Promise.all([publisher.cleanup(), follower.cleanup()]);
    }
  });

  it("does not bind when the promoted owner changes to a live incompatible record", async () => {
    const project = await realpath(
      await mkdtemp(join(tmpdir(), "wisp-dashboard-recheck-project-")),
    );
    process.env.HOME = await realpath(
      await mkdtemp(join(tmpdir(), "wisp-dashboard-recheck-home-")),
    );
    seam.replaceAfterAcquisition = true;
    const coordinator = new DashboardCoordinator(project);

    try {
      await expect(coordinator.start()).rejects.toMatchObject({
        code: "dashboard_version_conflict",
        details: { expected_protocol: 1, actual_protocol: 2 },
      });
    } finally {
      await coordinator.cleanup();
    }
  });

  it("removes its matching ready record when post-publication health proof fails", async () => {
    const project = await realpath(
      await mkdtemp(join(tmpdir(), "wisp-dashboard-health-project-")),
    );
    const home = await realpath(
      await mkdtemp(join(tmpdir(), "wisp-dashboard-health-home-")),
    );
    process.env.HOME = home;
    const health = vi.fn().mockRejectedValue(new Error("injected health failure"));
    vi.stubGlobal("fetch", health);
    const coordinator = new DashboardCoordinator(project);

    await expect(coordinator.start()).rejects.toMatchObject({
      code: "dashboard_unavailable",
      details: { reason: "owner_unhealthy", retryable: true },
    });
    expect(health).toHaveBeenCalledTimes(1);
    const owner = join(
      home,
      ".wisp/runtime/dashboard",
      createHash("sha256").update(project, "utf8").digest("hex"),
      "owner",
    );
    await expect(stat(owner)).rejects.toMatchObject({ code: "ENOENT" });
    await coordinator.cleanup();
  });

  it("orders cleanup after an in-flight start and publishes no dead owner", async () => {
    const project = await realpath(
      await mkdtemp(join(tmpdir(), "wisp-dashboard-close-race-project-")),
    );
    const home = await realpath(
      await mkdtemp(join(tmpdir(), "wisp-dashboard-close-race-home-")),
    );
    process.env.HOME = home;
    let healthStarted!: () => void;
    const reachedHealth = new Promise<void>((resolve) => { healthStarted = resolve; });
    let resolveHealth!: (response: Response) => void;
    const healthResponse = new Promise<Response>((resolve) => { resolveHealth = resolve; });
    vi.stubGlobal("fetch", vi.fn(() => {
      healthStarted();
      return healthResponse;
    }));
    const coordinator = new DashboardCoordinator(project);
    const starting = coordinator.start();
    await reachedHealth;
    const owner = join(
      home,
      ".wisp/runtime/dashboard",
      createHash("sha256").update(project, "utf8").digest("hex"),
      "owner",
    );
    const published = JSON.parse(
      await readFile(join(owner, "owner.json"), "utf8"),
    ) as { instance: string; project_key: string };
    let cleanupSettled = false;
    const cleanup = coordinator.cleanup().then(() => { cleanupSettled = true; });
    await Promise.resolve();
    expect(cleanupSettled).toBe(false);
    resolveHealth(new Response(JSON.stringify({
      ok: true,
      data: {
        protocol: 1,
        project_key: published.project_key,
        instance: published.instance,
      },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    await expect(starting).resolves.toMatchObject({ reused: false });
    await cleanup;
    await expect(stat(owner)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("issue #37 returns exact owner and follower envelopes at the 500ms health boundary and cleans the matching owner", async () => {
    const project = await realpath(
      await mkdtemp(join(tmpdir(), "wisp-dashboard-health-boundary-project-")),
    );
    const home = await realpath(
      await mkdtemp(join(tmpdir(), "wisp-dashboard-health-boundary-home-")),
    );
    process.env.HOME = home;
    let now = 0;
    let releaseBoundary!: () => void;
    const boundary = new Promise<void>((resolve) => { releaseBoundary = resolve; });
    const clock = {
      now: () => now,
      sleep: async () => undefined,
    };
    let ownerEntered!: () => void;
    const ownerAtHealth = new Promise<void>((resolve) => { ownerEntered = resolve; });
    let followerEntered!: () => void;
    const followerAtHealth = new Promise<void>((resolve) => { followerEntered = resolve; });
    const boundaryProof = (role: "publisher" | "follower", entered: () => void) =>
      async (
        _perform: () => Promise<void>,
        context: { role: "publisher" | "follower"; timeoutMs: number },
      ): Promise<void> => {
        expect(context).toEqual({ role, timeoutMs: 500 });
        entered();
        await boundary;
        expect(now).toBe(500);
        throw new Error(`${role} health deadline`);
      };
    const owner = new DashboardCoordinator(project, createRuntime(project), {
      clock,
      healthProof: boundaryProof("publisher", ownerEntered),
    });
    const follower = new DashboardCoordinator(project, createRuntime(project), {
      clock,
      healthProof: boundaryProof("follower", followerEntered),
    });
    const resolver = { resolve: vi.fn().mockResolvedValue(project) };
    const ownerDiagnostic = vi.fn();
    const followerDiagnostic = vi.fn();

    const ownerCall = callWispTool(
      "wisp_dashboard",
      {},
      resolver,
      createRuntime,
      ownerDiagnostic,
      () => owner,
    );
    await ownerAtHealth;
    const followerCall = callWispTool(
      "wisp_dashboard",
      {},
      resolver,
      createRuntime,
      followerDiagnostic,
      () => follower,
    );
    await followerAtHealth;
    now = 500;
    releaseBoundary();

    const [ownerResult, followerResult] = await Promise.all([ownerCall, followerCall]);
    const structuredContent = {
      ok: false,
      error: {
        code: "dashboard_unavailable",
        message: "Wisp dashboard is unavailable",
        details: { reason: "owner_unhealthy", retryable: true },
      },
    };
    const expected = {
      content: [{ type: "text", text: JSON.stringify(structuredContent) }],
      structuredContent,
      isError: true,
    };
    expect(ownerResult).toEqual(expected);
    expect(followerResult).toEqual(expected);
    expect(ownerDiagnostic).not.toHaveBeenCalled();
    expect(followerDiagnostic).not.toHaveBeenCalled();

    const ownerDirectory = join(
      home,
      ".wisp/runtime/dashboard",
      createHash("sha256").update(project, "utf8").digest("hex"),
      "owner",
    );
    await expect(stat(ownerDirectory)).rejects.toMatchObject({ code: "ENOENT" });
    await Promise.all([owner.cleanup(), follower.cleanup()]);
  });
});
