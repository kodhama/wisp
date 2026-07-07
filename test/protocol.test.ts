// Provenance: lifted into kodhama/espial from the math-quest prototype
// (test/espalier-viz-protocol.test.ts), originally discovery-espalier-runtime-viz
// AC1–AC6 (prototype exploration, branch claude/agentic-runtime-viz-x1884q).
// Tests the functional core of the wisp event protocol: parse, event
// construction, and the events → team-state reducer.
import { describe, expect, it } from "vitest";
import {
  deriveGraph,
  makeEvent,
  parseEvents,
  reduceTeamState,
  type GroveEvent,
} from "../protocol.ts";

const T0 = "2026-07-07T10:00:00.000Z";

function at(offsetSec: number): string {
  return new Date(Date.parse(T0) + offsetSec * 1000).toISOString();
}

function status(
  agent: string,
  state: "spawned" | "working" | "blocked" | "awaiting_gate" | "done" | "failed",
  offsetSec: number,
  extra: Partial<GroveEvent> = {},
): GroveEvent {
  return makeEvent({
    ts: at(offsetSec),
    run: "furrow-test",
    agent,
    kind: "status",
    state,
    ...extra,
  });
}

describe("parseEvents — AC1: malformed lines are loud, valid lines survive", () => {
  it("surfaces parse errors with line numbers instead of dropping them silently", () => {
    const good = JSON.stringify(status("executor", "working", 0));
    const ndjson = [good, "{not json", "", JSON.stringify({ v: 1, ts: at(1) })].join("\n");
    const { events, errors } = parseEvents(ndjson);
    expect(events).toHaveLength(1);
    expect(events[0]!.agent).toBe("executor");
    // line 2 is invalid JSON; line 3 (blank) is skipped, not an error; line 4
    // is structurally invalid (missing run/agent/kind)
    expect(errors.map((e) => e.line)).toEqual([2, 4]);
    expect(errors[0]!.reason).toMatch(/JSON/i);
    expect(errors[1]!.reason).toMatch(/run|agent|kind/i);
  });

  it("round-trips events produced by makeEvent", () => {
    const ev = status("validator", "spawned", 0, { activity: "cold start" });
    const { events, errors } = parseEvents(JSON.stringify(ev) + "\n");
    expect(errors).toHaveLength(0);
    expect(events[0]!).toEqual(ev);
  });
});

describe("makeEvent — construction is validated, loud on bad input", () => {
  it("stamps the protocol version", () => {
    expect(status("executor", "working", 0).v).toBe(1);
  });

  it("rejects a status event without a state", () => {
    expect(() =>
      makeEvent({ ts: T0, run: "r", agent: "a", kind: "status" }),
    ).toThrow(/state/);
  });

  it("rejects an unknown state", () => {
    expect(() =>
      // @ts-expect-error deliberately invalid
      makeEvent({ ts: T0, run: "r", agent: "a", kind: "status", state: "vibing" }),
    ).toThrow(/state/);
  });

  it("rejects empty run/agent", () => {
    expect(() => makeEvent({ ts: T0, run: "", agent: "a", kind: "heartbeat" })).toThrow(/run/);
    expect(() => makeEvent({ ts: T0, run: "r", agent: " ", kind: "heartbeat" })).toThrow(/agent/);
  });
});

describe("reduceTeamState — AC2: latest status wins, order-tolerant", () => {
  it("reflects the latest status event per agent by timestamp", () => {
    const events = [
      status("executor", "spawned", 0),
      status("executor", "working", 10, { activity: "writing failing test" }),
      status("executor", "done", 20),
    ];
    const state = reduceTeamState(events, at(21));
    const exec = state.runs[0]!.agents.find((a) => a.agent === "executor")!;
    expect(exec.state).toBe("done");
  });

  it("tolerates out-of-order appends (later ts appended earlier in the file)", () => {
    const events = [
      status("executor", "working", 10, { activity: "step 2" }),
      status("executor", "spawned", 0),
    ];
    const state = reduceTeamState(events, at(11));
    const exec = state.runs[0]!.agents.find((a) => a.agent === "executor")!;
    expect(exec.state).toBe("working");
    expect(exec.activity).toBe("step 2");
  });

  it("orders agents by first appearance in the run", () => {
    const events = [
      status("contract-author", "done", 0),
      status("spec-adversary", "working", 5),
      status("executor", "spawned", 8),
    ];
    const state = reduceTeamState(events, at(10));
    expect(state.runs[0]!.agents.map((a) => a.agent)).toEqual([
      "contract-author",
      "spec-adversary",
      "executor",
    ]);
  });
});

describe("reduceTeamState — AC3: staleness, and terminal states never stale", () => {
  const STALE_MS = 60_000;

  it("flags a non-terminal agent silent past the window as stale", () => {
    const events = [status("executor", "working", 0)];
    const state = reduceTeamState(events, at(120), STALE_MS);
    expect(state.runs[0]!.agents[0]!.stale).toBe(true);
  });

  it("a heartbeat refreshes lastSeen without changing state", () => {
    const events = [
      status("executor", "working", 0, { activity: "long step" }),
      makeEvent({ ts: at(90), run: "furrow-test", agent: "executor", kind: "heartbeat" }),
    ];
    const state = reduceTeamState(events, at(120), STALE_MS);
    const exec = state.runs[0]!.agents[0]!;
    expect(exec.state).toBe("working");
    expect(exec.activity).toBe("long step");
    expect(exec.stale).toBe(false);
    expect(exec.lastSeen).toBe(at(90));
  });

  it("done/failed agents are never stale, however old", () => {
    const events = [status("validator", "done", 0), status("executor", "failed", 1)];
    const state = reduceTeamState(events, at(100_000), STALE_MS);
    for (const a of state.runs[0]!.agents) expect(a.stale).toBe(false);
  });
});

describe("reduceTeamState — AC4: vacuity — no telemetry is not 'all quiet'", () => {
  it("distinguishes an empty bus from agents that reported terminal states", () => {
    const empty = reduceTeamState([], T0);
    expect(empty.telemetry).toBe(false);
    expect(empty.runs).toHaveLength(0);

    const reported = reduceTeamState([status("executor", "done", 0)], at(1));
    expect(reported.telemetry).toBe(true);
  });
});

describe("reduceTeamState — AC5: commands pend until acked by id", () => {
  const cmd = makeEvent({
    ts: at(30),
    run: "furrow-test",
    agent: "maintainer",
    kind: "command",
    command: { id: "cmd-1", type: "pause", target: "executor" },
  });

  it("an unacked command is pending", () => {
    const state = reduceTeamState([status("executor", "working", 0), cmd], at(31));
    const c = state.runs[0]!.commands[0]!;
    expect(c.status).toBe("pending");
    expect(c.target).toBe("executor");
    expect(c.issuedBy).toBe("maintainer");
  });

  it("an ack referencing the command id resolves it", () => {
    const ack = makeEvent({
      ts: at(40),
      run: "furrow-test",
      agent: "executor",
      kind: "command_ack",
      ack: { commandId: "cmd-1", result: "accepted", note: "pausing at step seam" },
    });
    const state = reduceTeamState([status("executor", "working", 0), cmd, ack], at(41));
    expect(state.runs[0]!.commands[0]!.status).toBe("accepted");
    expect(state.runs[0]!.commands[0]!.ackNote).toBe("pausing at step seam");
  });

  it("the command issuer does not appear as a working agent", () => {
    const state = reduceTeamState([status("executor", "working", 0), cmd], at(31));
    expect(state.runs[0]!.agents.map((a) => a.agent)).toEqual(["executor"]);
  });
});

describe("reduceTeamState — AC6: questions stay open until answered", () => {
  const question = makeEvent({
    ts: at(10),
    run: "furrow-test",
    agent: "executor",
    kind: "question",
    question: { id: "q-1", text: "Spec is silent on rounding mode — bankers or half-up?" },
  });

  it("an unanswered question is open", () => {
    const state = reduceTeamState([status("executor", "blocked", 9), question], at(11));
    const q = state.runs[0]!.questions[0]!;
    expect(q.open).toBe(true);
    expect(q.agent).toBe("executor");
  });

  it("an answer command referencing the question id closes it", () => {
    const answer = makeEvent({
      ts: at(20),
      run: "furrow-test",
      agent: "maintainer",
      kind: "command",
      command: {
        id: "cmd-2",
        type: "answer",
        target: "executor",
        payload: { questionId: "q-1", text: "half-up; record it under ## Assumptions" },
      },
    });
    const state = reduceTeamState(
      [status("executor", "blocked", 9), question, answer],
      at(21),
    );
    const q = state.runs[0]!.questions[0]!;
    expect(q.open).toBe(false);
    expect(q.answer).toBe("half-up; record it under ## Assumptions");
  });
});

describe("reduceTeamState — verdicts surface on the agent view", () => {
  it("keeps the last verdict visible", () => {
    const events = [
      status("conformance-reviewer", "working", 0),
      makeEvent({
        ts: at(5),
        run: "furrow-test",
        agent: "conformance-reviewer",
        kind: "verdict",
        verdict: "PASS",
        activity: "round 1 — no drift found",
      }),
      status("conformance-reviewer", "done", 6),
    ];
    const state = reduceTeamState(events, at(7));
    expect(state.runs[0]!.agents[0]!.lastVerdict).toBe("PASS");
  });
});

describe("deriveGraph — AC8: directed edges from events, transitive routing dashed", () => {
  const flow = (from: string, to: string, offsetSec: number, via?: string) =>
    makeEvent({
      ts: at(offsetSec),
      run: "furrow-test",
      agent: from,
      kind: "status",
      state: "working",
      to,
      activity: `handoff to ${to}`,
      ...(via ? { meta: { via } } : {}),
    });

  it("an event with `to` becomes a directed flow edge", () => {
    const g = deriveGraph([flow("contract-author", "spec-adversary", 0)], "furrow-test");
    expect(g.edges).toHaveLength(1);
    const e = g.edges[0]!;
    expect(e.from).toBe("contract-author");
    expect(e.to).toBe("spec-adversary");
    expect(e.kind).toBe("flow");
    expect(e.transitive).toBe(false);
  });

  it("meta.via marks the edge transitive and surfaces the hub node", () => {
    const g = deriveGraph(
      [flow("spec-adversary", "contract-author", 0, "head-gardener")],
      "furrow-test",
    );
    const e = g.edges[0]!;
    expect(e.transitive).toBe(true);
    expect(e.via).toBe("head-gardener");
    const hub = g.nodes.find((n) => n.id === "head-gardener")!;
    expect(hub.kind).toBe("hub");
  });

  it("repeat flows on the same pair aggregate: count grows, last label wins", () => {
    const g = deriveGraph(
      [flow("a", "b", 0), flow("a", "b", 5)],
      "furrow-test",
    );
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0]!.count).toBe(2);
    expect(g.edges[0]!.lastTs).toBe(at(5));
  });

  it("events from other runs are excluded", () => {
    const other = makeEvent({
      ts: at(0), run: "other-run", agent: "x", kind: "status", state: "working", to: "y",
    });
    const g = deriveGraph([other, flow("a", "b", 1)], "furrow-test");
    expect(g.nodes.map((n) => n.id).sort()).toEqual(["a", "b"]);
  });
});

describe("deriveGraph — AC9: the human is a node; commands/acks/questions are edges", () => {
  const working = status("executor", "working", 0);
  const cmd = makeEvent({
    ts: at(1), run: "furrow-test", agent: "maintainer", kind: "command",
    command: { id: "cmd-9", type: "pause", target: "executor" },
  });
  const ack = makeEvent({
    ts: at(2), run: "furrow-test", agent: "executor", kind: "command_ack",
    ack: { commandId: "cmd-9", result: "accepted" },
  });
  const question = makeEvent({
    ts: at(3), run: "furrow-test", agent: "executor", kind: "question",
    question: { id: "q-9", text: "which rounding?" },
  });

  it("a command is a directed edge issuer → target, and the issuer is a human node", () => {
    const g = deriveGraph([working, cmd], "furrow-test");
    const e = g.edges.find((x) => x.kind === "command")!;
    expect(e.from).toBe("maintainer");
    expect(e.to).toBe("executor");
    expect(g.nodes.find((n) => n.id === "maintainer")!.kind).toBe("human");
    expect(g.nodes.find((n) => n.id === "executor")!.kind).toBe("agent");
  });

  it("an ack points back at the command issuer", () => {
    const g = deriveGraph([working, cmd, ack], "furrow-test");
    const e = g.edges.find((x) => x.kind === "ack")!;
    expect(e.from).toBe("executor");
    expect(e.to).toBe("maintainer");
  });

  it("a question is an edge to the maintainer node, creating it if needed", () => {
    const g = deriveGraph([working, question], "furrow-test");
    const e = g.edges.find((x) => x.kind === "question")!;
    expect(e.from).toBe("executor");
    expect(e.to).toBe("maintainer");
    expect(g.nodes.find((n) => n.id === "maintainer")!.kind).toBe("human");
  });
});
