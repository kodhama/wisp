// Synthetic furrow replay — feeds the bus so the dashboard can be seen live
// without running a real swarm. Modeled on furrow 1 (#155, ADR-0030 §v0):
// contract-author → spec-adversary rounds → human spec gate → executor
// (with a mid-run parked question) → conformance gate → validator.
// Lifted into kodhama/espial from the math-quest prototype
// (tools/espalier/viz/demo.ts) — see this repo's README for provenance.
// This demo's vocabulary (furrows, gardeners) is Grove-specific; the
// README's "lift recipe" flags it for rewrite/drop by adopters (out of
// scope for this bootstrap step).
//
// Usage below still shows the source repo's tools/espalier/viz/ path; from
// this repo's root, invoke as `node demo.ts` (flat layout).
//   node tools/espalier/viz/demo.ts            # ~80s replay, real-time feel
//   node tools/espalier/viz/demo.ts --fast     # no sleeps (smoke test)
//
// The demo also exercises the command loop: it polls for pending commands
// like a real gardener would (emit.ts check) and acks them; if the parked
// question is not answered from the dashboard within its patience window,
// it answers itself so the replay always terminates.
import { appendEvent, busPath, readBus } from "./bus.ts";
import { makeEvent, reduceTeamState, type AgentState, type GroveEvent } from "./protocol.ts";

const FAST = process.argv.includes("--fast");
const RUN = "furrow-demo";
const sleep = (ms: number) => (FAST ? Promise.resolve() : new Promise((r) => setTimeout(r, ms)));

function emit(agent: string, partial: Omit<GroveEvent, "v" | "ts" | "run" | "agent">): void {
  appendEvent(busPath(), makeEvent({ ts: new Date().toISOString(), run: RUN, agent, ...partial }));
}
function status(agent: string, state: AgentState, activity?: string, refs?: string[]): void {
  emit(agent, { kind: "status", state, activity, refs });
}
/** A hand-off: status addressed to the next role. In v0 everything routes
 * through the head-gardener, so gardener→gardener hand-offs carry meta.via
 * (rendered dashed = transitive); the hub's own dispatches are direct. */
function handoff(agent: string, to: string, state: AgentState, activity: string, via?: string): void {
  emit(agent, { kind: "status", state, activity, to, ...(via ? { meta: { via } } : {}) });
}

function pendingFor(agent: string) {
  const { events } = readBus(busPath());
  const run = reduceTeamState(events, new Date().toISOString()).runs.find((r) => r.run === RUN);
  return (run?.commands ?? []).filter((c) => c.status === "pending" && c.target === agent);
}

/** Poll like a gardener at a step seam: ack anything pending, return answers. */
function seam(agent: string): { answered?: string | undefined } {
  let answered: string | undefined;
  for (const c of pendingFor(agent)) {
    emit(agent, { kind: "command_ack", ack: { commandId: c.id, result: "accepted", note: `handled at seam (${c.type})` } });
    if (c.type === "answer" && typeof c.payload?.text === "string") answered = c.payload.text;
  }
  return { answered };
}

console.log(`replaying ${RUN} onto ${busPath()}${FAST ? " (fast)" : ""} — open the dashboard`);

// Stage 3 — contract author
status("contract-author", "spawned", "cold start from issue brief", ["#155"]);
await sleep(2000);
status("contract-author", "working", "drafting spec-tier2-item-identity from approved intent", ["specs/tier2-item-identity.md"]);
await sleep(5000);
handoff("contract-author", "spec-adversary", "done", "spec drafted, promoted draft → gated — over to the adversary", "head-gardener");

// Stage 3½ — adversary rounds
status("spec-adversary", "spawned", "cold start against gated spec");
await sleep(2000);
status("spec-adversary", "working", "round 1 — hunting vacuous ACs and unpinned invariants");
await sleep(5000);
emit("spec-adversary", { kind: "verdict", verdict: "NEEDS-REVISION", activity: "round 1: AC7 untestable as written; INV-IS8 missing repeat-exception bound", to: "contract-author", meta: { via: "head-gardener" } });
status("contract-author", "working", "revising per adversary round 1");
await sleep(4000);
handoff("contract-author", "spec-adversary", "done", "revision pushed", "head-gardener");
status("spec-adversary", "working", "round 2 — re-checking the delta");
await sleep(4000);
emit("spec-adversary", { kind: "verdict", verdict: "APPROVE-READY", activity: "round 2: clean; forwarding to the human spec gate", to: "head-gardener" });
status("spec-adversary", "done");

// Human spec gate
status("head-gardener", "awaiting_gate", "spec gate — waiting on maintainer approval (intent gate never opens to agents)", ["ADR-0009"]);
await sleep(6000);
seam("head-gardener");
emit("maintainer", { kind: "command", command: { id: "cmd-gate-spec", type: "gate", target: "head-gardener", payload: { verdict: "approved" } } });
await sleep(1500);
emit("head-gardener", { kind: "command_ack", ack: { commandId: "cmd-gate-spec", result: "completed", note: "spec approved — dispatching executor" } });
handoff("head-gardener", "executor", "working", "dispatching executor (W1 step 5)");

// Stage 4 — executor, with a parked question
status("executor", "spawned", "cold start from spec + depends_on closure only");
await sleep(2000);
status("executor", "working", "failing test first: AC3 id-format round-trip", ["specs/tier2-item-identity.md#AC3"]);
await sleep(5000);
emit("executor", { kind: "question", question: { id: "q-collision", text: "Spec is silent on id-collision behavior across pools — surface as finding or pick least-surprise?" } });
status("executor", "blocked", "parked on q-collision (park-file-and-exit would fire in an unattended run)");

// Wait for a dashboard answer; self-answer after patience so the replay terminates.
const patienceMs = FAST ? 0 : 20_000;
const deadline = Date.now() + patienceMs;
let answer: string | undefined;
for (;;) {
  ({ answered: answer } = seam("executor"));
  if (answer) break;
  if (Date.now() >= deadline) break;
  await sleep(2000);
}
if (!answer) {
  emit("maintainer", { kind: "command", command: { id: "cmd-auto-answer", type: "answer", target: "executor", payload: { questionId: "q-collision", text: "(demo auto-answer) surface as finding; assume least-surprise" } } });
  await sleep(500);
  seam("executor");
}
status("executor", "working", "resuming with the answer recorded under ## Assumptions");
await sleep(5000);
status("executor", "working", "green — implementation matches AC1–AC9; heartbeat during long test run");
emit("executor", { kind: "heartbeat" });
await sleep(3000);
handoff("executor", "conformance-reviewer", "done", "PR pushed with Propagation section — over to the gate", "head-gardener");

// Stage 4½ + 5 in parallel: both consume the pushed PR — the conformance
// gate runs while the validator drafts its per-PR critique.
status("conformance-reviewer", "working", "gate vs approved spec + ground-truth checklist");
await sleep(2000);
status("validator", "working", "per-PR critique; no drift-audit trigger fired");
await sleep(3000);
emit("conformance-reviewer", { kind: "verdict", verdict: "PASS", activity: "round 1 — no drift; vacuity audit clean", to: "head-gardener" });
status("conformance-reviewer", "done");
await sleep(3000);
handoff("validator", "head-gardener", "done", "critique posted");
status("head-gardener", "done", "furrow complete — findings ledger updated");

console.log("replay complete");
