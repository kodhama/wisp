# wisp — LP content

Source content for `docs/index.html`, generated per `kodhama/design-system`'s
`lp-generator.md` contract at tag `v0.1.0`. This file is wisp's own copy —
the DS supplies no content, only tokens and patterns.

## What it is

Zero-dependency runtime observability for agent teams: live "who is working,
on what, who is blocked" for an agentic run, self-reported by the agents
themselves. (Verbatim framing from this repo's `README.md`.)

Requires Node ≥ 22.18 (runs `.ts` directly via type stripping). Zero runtime
dependencies — deliberately run with plain `node`, nothing installed.

Four pieces, one story:

1. **Protocol** (`protocol.ts`) — the functional core: event schema, parse,
   and a team-state reducer. Tested in isolation (`test/protocol.test.ts`).
2. **Bus** (`bus.ts`) — the file transport: append-only NDJSON at
   `.grove/runtime/events.ndjson` (override with `$GROVE_EVENTS`).
   Runtime state is gitignored — telemetry is a self-reported claim, never
   artifact-derived truth. That's the invariant the whole protocol exists to
   preserve.
3. **Emitter** (`emit.ts`) — the agent-facing CLI: status / heartbeat /
   verdict / question, plus command check/ack. This is what an agent calls
   to report itself.
4. **Dashboard** (`server.ts` + `dashboard.html`) — a zero-dep HTTP shell
   (dashboard + `/api/state` + `/api/events` + `POST /api/command`) serving a
   self-contained UI: the swarm graph (nodes = agents, human as a rounded
   square, hub-detected head-gardener at center; directed edges with message
   dots animating along them; dashed = flows transitively routed via the
   head-gardener; violet = the human command channel), agent cards, a state
   timeline, open questions answerable from the page, and the raw event feed.

`demo.ts` is the fifth piece worth naming on the LP even though it's not part
of the shipped protocol surface: a synthetic furrow replay, modeled on the
Grove prototype's furrow 1, that feeds the bus so the dashboard can be
seen live without a real swarm running. It's the thing that makes the product
demonstrable in thirty seconds, and it's the thing the hero below is built
from.

## Hero treatment: chosen, and why

**The plan's framing:** the hero is meant to be "the live graph replaying the
demo furrow — the demo becoming the LP's animation, same file, a real tool
rather than a mockup." A vendored, self-contained static `docs/index.html`
cannot literally embed a running Node process (`server.ts` + `demo.ts`
writing to a live NDJSON bus that a browser polls) — that would require
either a live backend the LP secretly depends on, or an iframe pointed at
some server, both of which break "renders correctly with network access to
nothing but its own bytes" from the vendoring section of the contract. Three
honest options were on the table:

- **(a) An inlined, deterministic replay of one captured run's timeline** —
  the exact scripted sequence from `demo.ts` (agent, state, activity string,
  hand-off target, routing), hardcoded as data and stepped through by CSS/JS
  entirely client-side, redrawing a simplified swarm graph faithful to
  `dashboard.html`'s own node/edge/state vocabulary.
- **(b) A static annotated screenshot** of the dashboard mid-run, paired with
  the real two-terminal command a visitor can run to see it live themselves.
- **(c) Something else** — e.g. a canned JSON blob of one real bus recording,
  replayed through a trimmed-down copy of the actual reducer/renderer code
  from `dashboard.html`, running client-side against static data instead of
  a live `/api/state` poll.

**Chosen: (a), leaning toward (c)'s spirit where it was cheap to do so.**
The hero on `docs/index.html` is a self-contained SVG + vanilla-JS replay of
`demo.ts`'s actual scripted furrow — every agent name, state, and activity
string in the replay's timeline array is lifted verbatim from `demo.ts`
(contract-author → spec-adversary rounds → human spec gate → executor with
its parked question → conformance-reviewer/validator in parallel → done).
The node layout, state icon/label vocabulary (`spawned ○`, `working ●`,
`awaiting_gate ◆`, `blocked ■`, `done ✓` — icon *and* label together, never
color alone, per `dashboard.html`'s own accessibility comment), and the
human-channel color are pulled from `dashboard.html`'s real `STATES` table
and `--human-ch` token, not invented for the LP. Per-step display durations
are compressed from the real replay's ~80s wall-clock (the sleeps in
`demo.ts` are tuned for watching a live terminal, not for a hero loop) but
the *order and content* of every step is unchanged — deterministic, not
randomized, and it loops.

**Why not (b) alone:** it's honest but inert — a screenshot doesn't carry
any of "the demo becoming the LP's animation." Why not a literal embed: it
would either be fake (an animated screenshot pretending to be live) or would
quietly break vendoring (an iframe to a hosted or local server). (a) is the
closest a static file can get to "the demo, replayed, in the same file" —
it's real recorded content, deterministically replayed, not a mockup — while
staying honest that it is a *replay of a capture*, not a live connection.
That honesty is stated explicitly in the hero's own copy, directly under the
animation, alongside the actual two-line command
(`node server.ts` / `node demo.ts`) a visitor can run locally to watch the
real live version — folding in (b)'s spirit as a fallback/complement rather
than a substitute.

**Tradeoff, stated plainly:** a visitor cannot make the hero do anything —
no clicking a node to pause/resume/steer/abort, no answering the parked
question from the LP itself, none of the real dashboard's interactivity.
Those require a live bus and a live server; the LP cannot vendor that away.
The hero shows *what happens*, faithfully and repeatably; only running the
real two commands shows *what it's like to drive it*.

## Install notes

wisp ships as source, not a package, today. The family's current
distribution default is **vendored-copy**: clone the repo (or copy its flat
files — `protocol.ts`, `bus.ts`, `emit.ts`, `server.ts`, `dashboard.html`)
straight into the consuming project. There is no build step and nothing to
install — it's plain `.ts` run directly by Node's type stripping (Node ≥
22.18).

Publishing `@kodhama/wisp` to npm (the `name` is already reserved in
`package.json`) is a later option, not a commitment made by this LP — noted
so the install section doesn't imply an `npm install` that doesn't work yet.
