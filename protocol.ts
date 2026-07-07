// Espalier runtime-viz event protocol — functional core (no I/O).
// Lifted into kodhama/espial from the math-quest prototype
// (tools/espalier/viz/protocol.ts) — see this repo's README for provenance.
// Upstream: discovery-espalier-runtime-viz (prototype). Design constraints
// inherited from ADR-0030: telemetry is self-reported CLAIMS, never a
// substitute for artifact-derived truth; absence of telemetry must be
// distinguishable from "all quiet" (vacuity detection); failures are loud.
//
// The vocabulary is deliberately team-agnostic — agent/run/state/activity/refs
// carry no math-quest or Espalier nouns — so the protocol lifts out with
// Espalier and applies to any agentic team. Role semantics (gardener names,
// verdict grammars) ride in `verdict`, `refs`, and `meta`.

export const PROTOCOL_VERSION = 1;

export const AGENT_STATES = [
  "spawned",
  "working",
  "blocked",
  "awaiting_gate",
  "done",
  "failed",
] as const;
export type AgentState = (typeof AGENT_STATES)[number];

/** States after which an agent is finished — never counted stale. */
export const TERMINAL_STATES: readonly AgentState[] = ["done", "failed"];

export const EVENT_KINDS = [
  "status", // state transition + human-readable activity
  "heartbeat", // liveness only; no state change (hook-emittable)
  "verdict", // a gate/reviewer outcome, constrained grammar per role
  "question", // agent parked on a question (park-file-and-exit companion)
  "command", // human → agent instruction (roadmap; prototyped minimally)
  "command_ack", // agent acknowledges/resolves a command by id
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const COMMAND_TYPES = [
  "pause",
  "resume",
  "abort",
  "answer", // payload: { questionId, text }
  "gate", // payload: { verdict } — the human acting at a human gate
  "steer", // payload: { text } — inject context/priority
  "dispatch", // payload: { workflow, brief } — start W1..Wn
] as const;
export type CommandType = (typeof COMMAND_TYPES)[number];

export interface CommandBody {
  id: string;
  type: CommandType;
  target: string; // agent name the command addresses
  payload?: Record<string, unknown> | undefined;
}

export interface AckBody {
  commandId: string;
  result: "accepted" | "rejected" | "completed";
  note?: string | undefined;
}

export interface QuestionBody {
  id: string;
  text: string;
}

export interface EspalierEvent {
  v: number;
  ts: string; // ISO-8601, emitter's clock
  run: string; // run/furrow instance id
  agent: string; // emitting agent ("maintainer"/"human" for commands)
  kind: EventKind;
  /**
   * Optional recipient — names the agent this event is addressed/handed to,
   * making it a directed graph edge (see deriveGraph). When the *actual*
   * channel runs through a hub (v0: everything routes via the
   * head-gardener), set `meta.via` to the hub's name: the edge then renders
   * as transitive (dashed) rather than a direct channel. Absent on v1
   * events; additive, so no version bump.
   */
  to?: string | undefined;
  state?: AgentState | undefined; // required for kind=status
  activity?: string | undefined;
  refs?: string[] | undefined; // artifact anchors, issues, PRs
  verdict?: string | undefined; // required for kind=verdict
  question?: QuestionBody | undefined; // required for kind=question
  command?: CommandBody | undefined; // required for kind=command
  ack?: AckBody | undefined; // required for kind=command_ack
  meta?: Record<string, unknown> | undefined;
}

export interface ParseError {
  line: number; // 1-based line number in the NDJSON input
  reason: string;
  raw: string;
}

// ---------------------------------------------------------------------------
// Construction & validation — loud on bad input, per the loud-failure floor.
// ---------------------------------------------------------------------------

function fail(reason: string): never {
  throw new Error(`invalid espalier event: ${reason}`);
}

function requireNonBlank(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    fail(`"${field}" must be a non-empty string`);
  }
  return value;
}

/** Validate and stamp an event. Throws on structural problems. */
export function makeEvent(input: Omit<EspalierEvent, "v"> & { v?: number | undefined }): EspalierEvent {
  const ts = requireNonBlank(input.ts, "ts");
  if (Number.isNaN(Date.parse(ts))) fail(`"ts" is not a parseable timestamp: ${ts}`);
  const run = requireNonBlank(input.run, "run");
  const agent = requireNonBlank(input.agent, "agent");
  const kind = input.kind;
  if (!EVENT_KINDS.includes(kind)) fail(`unknown kind "${String(kind)}"`);

  if (kind === "status") {
    if (input.state === undefined || !AGENT_STATES.includes(input.state)) {
      fail(`status event needs a valid state (got "${String(input.state)}")`);
    }
  }
  if (kind === "verdict") requireNonBlank(input.verdict, "verdict");
  if (kind === "question") {
    if (!input.question) fail("question event needs a question body");
    requireNonBlank(input.question.id, "question.id");
    requireNonBlank(input.question.text, "question.text");
  }
  if (kind === "command") {
    if (!input.command) fail("command event needs a command body");
    requireNonBlank(input.command.id, "command.id");
    requireNonBlank(input.command.target, "command.target");
    if (!COMMAND_TYPES.includes(input.command.type)) {
      fail(`unknown command type "${String(input.command.type)}"`);
    }
  }
  if (kind === "command_ack") {
    if (!input.ack) fail("command_ack event needs an ack body");
    requireNonBlank(input.ack.commandId, "ack.commandId");
    if (!["accepted", "rejected", "completed"].includes(input.ack.result)) {
      fail(`unknown ack result "${String(input.ack.result)}"`);
    }
  }

  return { ...input, run: run.trim(), agent: agent.trim(), v: input.v ?? PROTOCOL_VERSION };
}

/**
 * Parse an NDJSON event log. Malformed lines become ParseErrors with their
 * line number — never silently dropped. Blank lines are skipped.
 */
export function parseEvents(ndjson: string): { events: EspalierEvent[]; errors: ParseError[] } {
  const events: EspalierEvent[] = [];
  const errors: ParseError[] = [];
  const lines = ndjson.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = (lines[i] ?? "").trim();
    if (raw === "") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      errors.push({ line: i + 1, reason: `not valid JSON: ${(e as Error).message}`, raw });
      continue;
    }
    try {
      events.push(makeEvent(parsed as EspalierEvent));
    } catch (e) {
      errors.push({ line: i + 1, reason: (e as Error).message, raw });
    }
  }
  return { events, errors };
}

// ---------------------------------------------------------------------------
// Reduction: events → team state (pure; clock passed in).
// ---------------------------------------------------------------------------

export interface AgentView {
  agent: string;
  state: AgentState;
  activity?: string | undefined;
  refs: string[];
  lastSeen: string; // ts of the agent's most recent event of any kind
  stale: boolean; // non-terminal and silent past the staleness window
  lastVerdict?: string | undefined;
  events: number;
}

export interface CommandView {
  id: string;
  type: CommandType;
  target: string;
  issuedBy: string;
  issuedAt: string;
  payload?: Record<string, unknown> | undefined;
  status: "pending" | "accepted" | "rejected" | "completed";
  ackNote?: string | undefined;
}

export interface QuestionView {
  id: string;
  agent: string;
  text: string;
  askedAt: string;
  open: boolean;
  answer?: string | undefined;
}

export interface RunState {
  run: string;
  agents: AgentView[]; // ordered by first appearance
  commands: CommandView[];
  questions: QuestionView[];
  firstTs: string;
  lastTs: string;
}

export interface TeamState {
  /**
   * Vacuity guard: false means the bus carried NO events at all — which the
   * consumer must render as "no telemetry", never as "all agents quiet".
   */
  telemetry: boolean;
  runs: RunState[];
  generatedAt: string;
}

export const DEFAULT_STALE_AFTER_MS = 120_000;

export function reduceTeamState(
  events: EspalierEvent[],
  now: string,
  staleAfterMs: number = DEFAULT_STALE_AFTER_MS,
): TeamState {
  const sorted = [...events].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const runs = new Map<string, RunState>();
  const nowMs = Date.parse(now);

  interface AgentAccum {
    view: AgentView;
    lastStatusTs: number;
  }
  const agents = new Map<string, AgentAccum>(); // key: run\0agent

  for (const ev of sorted) {
    let run = runs.get(ev.run);
    if (!run) {
      run = { run: ev.run, agents: [], commands: [], questions: [], firstTs: ev.ts, lastTs: ev.ts };
      runs.set(ev.run, run);
    }
    run.lastTs = ev.ts;

    if (ev.kind === "command" && ev.command) {
      run.commands.push({
        id: ev.command.id,
        type: ev.command.type,
        target: ev.command.target,
        issuedBy: ev.agent,
        issuedAt: ev.ts,
        payload: ev.command.payload,
        status: "pending",
      });
      if (ev.command.type === "answer") {
        const qid = ev.command.payload?.questionId;
        const q = run.questions.find((x) => x.id === qid);
        if (q) {
          q.open = false;
          const text = ev.command.payload?.text;
          if (typeof text === "string") q.answer = text;
        }
      }
      continue; // the issuer is not a run agent
    }

    const key = `${ev.run} ${ev.agent}`;
    let acc = agents.get(key);
    if (!acc) {
      acc = {
        view: {
          agent: ev.agent,
          state: "spawned",
          refs: [],
          lastSeen: ev.ts,
          stale: false,
          events: 0,
        },
        lastStatusTs: -Infinity,
      };
      agents.set(key, acc);
      run.agents.push(acc.view);
    }
    acc.view.events += 1;
    if (Date.parse(ev.ts) >= Date.parse(acc.view.lastSeen)) acc.view.lastSeen = ev.ts;

    switch (ev.kind) {
      case "status": {
        const tsMs = Date.parse(ev.ts);
        if (tsMs >= acc.lastStatusTs) {
          acc.lastStatusTs = tsMs;
          acc.view.state = ev.state as AgentState;
          if (ev.activity !== undefined) acc.view.activity = ev.activity;
          if (ev.refs) acc.view.refs = ev.refs;
        }
        break;
      }
      case "verdict":
        acc.view.lastVerdict = ev.verdict;
        break;
      case "question":
        if (ev.question) {
          run.questions.push({
            id: ev.question.id,
            agent: ev.agent,
            text: ev.question.text,
            askedAt: ev.ts,
            open: true,
          });
        }
        break;
      case "command_ack": {
        if (ev.ack) {
          const cmd = run.commands.find((c) => c.id === ev.ack!.commandId);
          if (cmd) {
            cmd.status = ev.ack.result;
            if (ev.ack.note !== undefined) cmd.ackNote = ev.ack.note;
          }
        }
        break;
      }
      case "heartbeat":
        break; // lastSeen already updated
    }
  }

  for (const { view } of agents.values()) {
    view.stale =
      !TERMINAL_STATES.includes(view.state) &&
      nowMs - Date.parse(view.lastSeen) > staleAfterMs;
  }

  return { telemetry: sorted.length > 0, runs: [...runs.values()], generatedAt: now };
}

// ---------------------------------------------------------------------------
// Graph derivation: events → nodes + directed edges (pure).
// ---------------------------------------------------------------------------

export type NodeKind = "agent" | "human" | "hub";
export type EdgeKind = "flow" | "command" | "ack" | "question";

export interface GraphNode {
  id: string;
  kind: NodeKind;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  /** true = logically direct but physically routed via a hub — render dashed. */
  transitive: boolean;
  via?: string | undefined; // the hub, when transitive
  count: number;
  lastTs: string;
  lastLabel?: string | undefined;
}

export interface GraphView {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Derive the interaction graph of one run. Edge sources, in protocol terms:
 *  - any event carrying `to`            → flow      emitter → recipient
 *  - kind=command                       → command   issuer  → target
 *  - kind=command_ack                   → ack       agent   → issuer of the acked command
 *  - kind=question                      → question  agent   → "maintainer" (or `to`)
 * Node kinds: emitters of status/heartbeat/verdict/question are agents;
 * pure command issuers are humans; `opts.hub` (or any `meta.via` value seen)
 * marks the hub. Like reduceTeamState, this reads only claims — the graph is
 * telemetry, not artifact truth.
 */
export function deriveGraph(
  events: EspalierEvent[],
  run: string,
  opts: { hub?: string | undefined } = {},
): GraphView {
  const inRun = events
    .filter((e) => e.run === run)
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));

  const workers = new Set<string>(); // emitted non-command events
  const issuers = new Set<string>(); // issued commands
  const order: string[] = []; // first-appearance order, for stable layout
  const seen = new Set<string>();
  const note = (id: string) => {
    if (!seen.has(id)) {
      seen.add(id);
      order.push(id);
    }
  };

  const edges = new Map<string, GraphEdge>();
  const addEdge = (
    from: string,
    to: string,
    kind: EdgeKind,
    ev: EspalierEvent,
    via?: string | undefined,
  ) => {
    if (from === to) return;
    note(from);
    note(to);
    const key = `${kind}|${via ?? ""}|${from}→${to}`;
    const existing = edges.get(key);
    const label = ev.activity ?? ev.verdict ?? ev.question?.text ?? ev.command?.type;
    if (existing) {
      existing.count += 1;
      existing.lastTs = ev.ts;
      if (label !== undefined) existing.lastLabel = label;
    } else {
      edges.set(key, {
        from,
        to,
        kind,
        transitive: via !== undefined,
        via,
        count: 1,
        lastTs: ev.ts,
        lastLabel: label,
      });
    }
  };

  const commandIssuer = new Map<string, string>(); // command id → issuer
  let hub = opts.hub;

  for (const ev of inRun) {
    const via = typeof ev.meta?.via === "string" ? ev.meta.via : undefined;
    if (via !== undefined && hub === undefined) hub = via;

    if (ev.kind === "command" && ev.command) {
      issuers.add(ev.agent);
      commandIssuer.set(ev.command.id, ev.agent);
      addEdge(ev.agent, ev.command.target, "command", ev);
      continue;
    }

    workers.add(ev.agent);
    note(ev.agent);

    if (ev.kind === "command_ack" && ev.ack) {
      const issuer = commandIssuer.get(ev.ack.commandId);
      if (issuer !== undefined) addEdge(ev.agent, issuer, "ack", ev);
      continue;
    }
    if (ev.kind === "question") {
      addEdge(ev.agent, ev.to ?? "maintainer", "question", ev);
      continue;
    }
    if (ev.to !== undefined) {
      addEdge(ev.agent, ev.to, "flow", ev, via);
    }
  }

  if (hub !== undefined) note(hub); // routing infrastructure is a node even if it never emitted

  const nodes: GraphNode[] = order.map((id) => ({
    id,
    kind:
      id === hub
        ? "hub"
        : workers.has(id)
          ? "agent"
          : issuers.has(id)
            ? "human"
            : "human", // referenced only as a recipient (e.g. "maintainer")
  }));

  return { nodes, edges: [...edges.values()] };
}
