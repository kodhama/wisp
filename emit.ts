// Grove status emitter — the CLI gardeners call to report themselves.
// Lifted into kodhama/espial from the math-quest prototype
// (tools/espalier/viz/emit.ts) — see this repo's README for provenance.
// Usage below still shows the source repo's tools/espalier/viz/ path; from
// this repo's root, invoke as `node emit.ts ...` (flat layout).
// Usage (from the repo root; requires Node >= 22.18 for type stripping):
//
//   node tools/espalier/viz/emit.ts status    --run furrow-163 --agent executor \
//        --state working --activity "failing regression test for INV-T2-13" \
//        --ref specs/spec-tier2-generation.md#INV-T2-13 --ref "#163"
//   node tools/espalier/viz/emit.ts heartbeat --run furrow-163 --agent executor
//   node tools/espalier/viz/emit.ts verdict   --run furrow-163 --agent conformance-reviewer \
//        --verdict PASS --activity "round 1 — no drift" --to head-gardener
//   # --to <role> addresses the event (a directed graph edge); add
//   # --via head-gardener when the flow physically routes through the hub
//   # (renders as a dashed/transitive edge instead of a direct channel)
//   node tools/espalier/viz/emit.ts question  --run furrow-163 --agent executor \
//        --id q-rounding --text "Spec silent on rounding mode — bankers or half-up?"
//   node tools/espalier/viz/emit.ts check     --run furrow-163 --agent executor
//   node tools/espalier/viz/emit.ts ack       --run furrow-163 --agent executor \
//        --command-id cmd-1 --result accepted --note "pausing at step seam"
//
// `check` prints the pending commands addressed to --agent as JSON (an empty
// array when there are none) — poll it at step seams; ack what you handle.
// Telemetry is a self-reported claim: never emit progress you have not made.
import { parseArgs } from "node:util";
import { appendEvent, busPath, readBus } from "./bus.ts";
import {
  makeEvent,
  reduceTeamState,
  type AgentState,
  type GroveEvent,
} from "./protocol.ts";

function usageFail(message: string): never {
  process.stderr.write(`emit.ts: ${message}\n`);
  process.exit(2);
}

const [subcommand, ...rest] = process.argv.slice(2);
if (!subcommand) usageFail("missing subcommand (status|heartbeat|verdict|question|ack|check)");

const { values } = parseArgs({
  args: rest,
  options: {
    run: { type: "string" },
    agent: { type: "string" },
    to: { type: "string" }, // recipient — draws a directed edge in the graph
    via: { type: "string" }, // hub the message physically routes through (dashed edge)
    state: { type: "string" },
    activity: { type: "string" },
    ref: { type: "string", multiple: true },
    verdict: { type: "string" },
    id: { type: "string" },
    text: { type: "string" },
    "command-id": { type: "string" },
    result: { type: "string" },
    note: { type: "string" },
  },
});

const run = values.run ?? usageFail("--run is required");
const agent = values.agent ?? usageFail("--agent is required");
const ts = new Date().toISOString();

function emit(partial: Omit<GroveEvent, "v" | "ts" | "run" | "agent">): void {
  const addressed = {
    ...partial,
    ...(values.to !== undefined ? { to: values.to } : {}),
    ...(values.via !== undefined ? { meta: { ...partial.meta, via: values.via } } : {}),
  };
  const event = makeEvent({ ts, run, agent, ...addressed }); // throws loudly on bad input
  appendEvent(busPath(), event);
  process.stdout.write(`emitted ${event.kind} → ${busPath()}\n`);
}

switch (subcommand) {
  case "status":
    emit({
      kind: "status",
      state: values.state as AgentState,
      activity: values.activity,
      refs: values.ref,
    });
    break;
  case "heartbeat":
    emit({ kind: "heartbeat" });
    break;
  case "verdict":
    emit({ kind: "verdict", verdict: values.verdict, activity: values.activity });
    break;
  case "question":
    emit({
      kind: "question",
      question: { id: values.id ?? usageFail("--id required"), text: values.text ?? usageFail("--text required") },
    });
    break;
  case "ack":
    emit({
      kind: "command_ack",
      ack: {
        commandId: values["command-id"] ?? usageFail("--command-id required"),
        result: (values.result ?? "accepted") as "accepted" | "rejected" | "completed",
        note: values.note,
      },
    });
    break;
  case "check": {
    const { events, errors } = readBus(busPath());
    if (errors.length > 0) {
      process.stderr.write(`warning: ${errors.length} malformed line(s) on the bus\n`);
    }
    const state = reduceTeamState(events, ts);
    const mine = (state.runs.find((r) => r.run === run)?.commands ?? []).filter(
      (c) => c.status === "pending" && (c.target === agent || c.target === "*"),
    );
    process.stdout.write(JSON.stringify(mine, null, 2) + "\n");
    break;
  }
  default:
    usageFail(`unknown subcommand "${subcommand}"`);
}
