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
| `github.ts` | adapter — GitHub issue comments as a runner-hosted telemetry channel (`test/github.test.ts`) |

Runtime state under `.grove/` is gitignored: telemetry is a
self-reported claim, never artifact-derived truth — the invariant this
protocol was designed to preserve.

## Adapters

`bus.ts`'s local file transport assumes the emitting agent and the
consumer share a filesystem. `github.ts` is for when they don't — a
runner-hosted agent (e.g. a CI job) mirrors its local bus outward as a
GitHub issue comment, and a reader elsewhere lists that issue's comments
and parses them back into events.

- **Emitter** (`emitToGithub`, CLI: `node github.ts emit`): reads the
  local bus (`bus.ts`'s `readBus`/`busPath`) and posts its events as one
  new issue comment — a `<!-- wisp-telemetry v1 -->` marker line followed
  by a fenced ` ```ndjson ` block, one event per line, verbatim. One
  batch = one comment.
- **Reader** (`readFromGithub`, CLI: `node github.ts read`, the
  `check`-equivalent): lists the issue's comments, keeps only
  marker-bearing ones, and parses their fenced blocks through
  `protocol.ts`'s `parseEvents`. Returns `{ events, errors }` — the same
  shape `bus.ts`'s `readBus` returns — so a reader can feed it straight
  into `reduceTeamState` and get the same vacuity handling for free.

Config is via env: `GITHUB_TOKEN` (auth), `WISP_GH_REPO` (`owner/repo`),
`WISP_GH_ISSUE` (issue number). Uses the built-in global `fetch` only —
no new dependency. Non-2xx responses fail loudly (status + a body
excerpt), never silently.

**Genericity budget:** "grove is the reference consumer; generalize
only what falls out naturally, never speculatively." `github.ts` shares
exactly the `{ events, errors }` shape with `bus.ts`'s `readBus` and
nothing more — there is no adapter registry and no transport interface
here, only as much shared surface as fell out of the two adapters
actually needing it.

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
(wave 2: adapters). A landing page is not tracked here — `kodhama-0006`
makes LP generation a design-system feature, triggered externally.

## License

MIT — see `LICENSE`.
