// Offline tests for the GitHub comments adapter (lane B3) — no network;
// global fetch is mocked throughout. Exercises the plan's AC3: "GitHub
// adapter emits and reads back a round-trip event batch."
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appendEvent } from "../bus.ts";
import { emitToGithub, formatComment, MARKER, readFromGithub } from "../github.ts";
import { makeEvent, type GroveEvent } from "../protocol.ts";

const T0 = "2026-07-08T10:00:00.000Z";
function at(offsetSec: number): string {
  return new Date(Date.parse(T0) + offsetSec * 1000).toISOString();
}

let tmpDir: string;
let busFile: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "wisp-gh-test-"));
  busFile = join(tmpDir, "events.ndjson");
  process.env.GROVE_EVENTS = busFile;
  process.env.GITHUB_TOKEN = "test-token";
  process.env.WISP_GH_REPO = "kodhama/wisp";
  process.env.WISP_GH_ISSUE = "999";
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.GROVE_EVENTS;
  delete process.env.GITHUB_TOKEN;
  delete process.env.WISP_GH_REPO;
  delete process.env.WISP_GH_ISSUE;
  vi.unstubAllGlobals();
});

function sampleEvents(): GroveEvent[] {
  return [
    makeEvent({ ts: at(0), run: "r1", agent: "executor", kind: "status", state: "working", activity: "digging" }),
    makeEvent({ ts: at(1), run: "r1", agent: "executor", kind: "heartbeat" }),
    makeEvent({ ts: at(2), run: "r1", agent: "reviewer", kind: "verdict", verdict: "PASS", to: "head-gardener" }),
  ];
}

describe("emitToGithub — mirrors the local bus as one issue comment", () => {
  it("POSTs a marker-bearing fenced ndjson comment with the bus's events verbatim", async () => {
    const events = sampleEvents();
    for (const e of events) appendEvent(busFile, e);

    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        capturedUrl = url;
        capturedInit = init;
        return new Response(JSON.stringify({ id: 42 }), { status: 201 });
      }),
    );

    const result = await emitToGithub();

    expect(result).toEqual({ commentId: 42, events: 3 });
    expect(capturedUrl).toBe("https://api.github.com/repos/kodhama/wisp/issues/999/comments");
    expect(capturedInit?.method).toBe("POST");
    const body = JSON.parse(capturedInit!.body as string).body as string;
    expect(body.startsWith(MARKER)).toBe(true);
    expect(body).toContain("```ndjson");
    // Lossless: every emitted event appears verbatim, one JSON object per line.
    for (const e of events) expect(body).toContain(JSON.stringify(e));
  });
});

describe("round-trip fidelity — AC3", () => {
  it("reads back exactly what was emitted, in order", async () => {
    const events = sampleEvents();
    for (const e of events) appendEvent(busFile, e);

    let posted: string | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          posted = JSON.parse(init.body as string).body;
          return new Response(JSON.stringify({ id: 1 }), { status: 201 });
        }
        return new Response(JSON.stringify([{ id: 1, body: posted }]), { status: 200 });
      }),
    );

    await emitToGithub();
    const { events: readBack, errors } = await readFromGithub();

    expect(errors).toEqual([]);
    expect(readBack).toEqual(events);
  });
});

describe("marker filtering — non-adapter comments are ignored", () => {
  it("skips comments without the wisp-telemetry marker", async () => {
    const events = sampleEvents();
    const body = formatComment(events);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify([
            { id: 1, body: "just a human saying hi" },
            { id: 2, body: "<!-- some-other-bot v1 -->\n```ndjson\n{}\n```" },
            { id: 3, body },
          ]),
          { status: 200 },
        ),
      ),
    );

    const { events: readBack, errors } = await readFromGithub();

    expect(errors).toEqual([]);
    expect(readBack).toEqual(events);
  });
});

describe("error paths", () => {
  it("fails loudly on a non-2xx response, including status and a body excerpt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("issue not found", { status: 404, statusText: "Not Found" })),
    );

    await expect(readFromGithub()).rejects.toThrow(/404/);
    await expect(readFromGithub()).rejects.toThrow(/issue not found/);
  });

  it("reports a malformed fenced block via errors, not by throwing", async () => {
    const badBody = `${MARKER}\n\`\`\`ndjson\n{not valid json\n\`\`\`\n`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify([{ id: 7, body: badBody }]), { status: 200 })),
    );

    const { events, errors } = await readFromGithub();

    expect(events).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.reason).toMatch(/comment 7/);
    expect(errors[0]!.reason).toMatch(/JSON/i);
  });

  it("reports a marker comment with no fenced block at all, without swallowing it", async () => {
    const badBody = `${MARKER}\njust prose, no fence`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify([{ id: 9, body: badBody }]), { status: 200 })),
    );

    const { events, errors } = await readFromGithub();

    expect(events).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.reason).toMatch(/comment 9/);
    expect(errors[0]!.reason).toMatch(/no fenced ndjson block/);
  });
});

describe("vacuity — absence is a valid empty result, not an error", () => {
  it("returns { events: [], errors: [] } when there are no comments at all", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })));

    const result = await readFromGithub();

    expect(result).toEqual({ events: [], errors: [] });
  });

  it("returns the identical shape when a marker comment explicitly carries a batch of zero events", async () => {
    const emptyBody = formatComment([]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify([{ id: 3, body: emptyBody }]), { status: 200 })),
    );

    const result = await readFromGithub();

    expect(result).toEqual({ events: [], errors: [] });
  });
});

describe("config", () => {
  it("fails loudly when a required env var is missing", async () => {
    delete process.env.GITHUB_TOKEN;
    await expect(readFromGithub()).rejects.toThrow(/GITHUB_TOKEN/);
  });

  it("fails loudly on a malformed WISP_GH_REPO", async () => {
    process.env.WISP_GH_REPO = "not-owner-slash-repo";
    await expect(readFromGithub()).rejects.toThrow(/owner\/repo/);
  });
});
