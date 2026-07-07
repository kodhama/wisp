# wisp

Zero-dependency runtime observability for agent teams: live "who is
working, on what, who is blocked" for an agentic run, self-reported by the
agents themselves.

Requires Node ≥ 22.18 (runs `.ts` directly via type stripping). Zero
runtime dependencies; deliberately run with plain `node`.

```sh
# terminal 1 — dashboard on http://localhost:4177
node server.ts

# terminal 2 — synthetic furrow replay (~80s; --fast for a smoke run)
node demo.ts
```

While the replay runs, the dashboard shows the **swarm graph** (nodes =
agents, human as a rounded square, hub-detected head-gardener at center;
directed edges with message dots animating along them; dashed = flows
transitively routed via the head-gardener; violet = the human command
channel; click a node for pause/resume/steer/abort and, when applicable,
gate approve/reject or answer), plus agent cards, a state timeline, open
questions (answerable from the page), and the raw event feed. Try answering
the executor's parked question, or sending `steer`/`pause` from a card or
node — the demo gardener polls and acks at its step seams.

Pieces:

| File | Role |
|---|---|
| `protocol.ts` | functional core — event schema, parse, team-state reducer (tested in `test/protocol.test.ts`) |
| `bus.ts` | file transport (append-only NDJSON at `.grove/runtime/events.ndjson`, override with `$GROVE_EVENTS`) |
| `emit.ts` | agent CLI — status/heartbeat/verdict/question + command check/ack |
| `server.ts` | zero-dep HTTP shell — dashboard + `/api/state` + `/api/events` + `POST /api/command` |
| `dashboard.html` | self-contained UI, light/dark |
| `demo.ts` | synthetic furrow replay modeled on the Espalier prototype's furrow 1 |

Runtime state under `.grove/` is gitignored: telemetry is a
self-reported claim, never artifact-derived truth — the invariant this
protocol was designed to preserve.

## Provenance

This repo is a lift of `tools/espalier/viz/` and
`test/espalier-viz-protocol.test.ts` out of the math-quest prototype
(the Espalier runtime-viz discovery), flattened into a standalone,
dependency-free package. The lift was mechanical: files, not rewritten
logic. Source-repo file paths and framing still visible in a few code
comments (e.g. `emit.ts`, `server.ts`, `demo.ts` usage examples, and the
`CLAUDE.md §Local secrets` reference in `server.ts`) are carried over
as-is from the prototype and have not yet been reconciled to this repo's
layout or docs — flagged here rather than silently left stale.

`demo.ts` is the one file that stays Grove-vocabulary-coupled
(furrows, gardeners, ADR-0030 framing) — adapting or replacing it for a
generic agent-team story, and wiring up real emitter adapters, is
out of scope for this bootstrap step and is tracked as follow-up work
(wave 2: landing page + adapters).

## License

MIT — see `LICENSE`.
