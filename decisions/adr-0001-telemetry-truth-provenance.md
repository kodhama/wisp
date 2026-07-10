---
id: adr-0001-telemetry-truth-provenance
type: adr
status: draft
depends_on: [math-quest/adr-0030-espalier]
owner: agent
updated: 2026-07-10
---

# ADR-0001 — Telemetry is claims, not truth: provenance from math-quest's ADR-0030

> **Draft, not gated.** This is wisp's first real decisions/ artifact — no
> self-check precedent to compare against, no rubric filed yet for wisp
> decisions (per `decisions/README.md`, only the base contract exists), and
> — the larger reason — its own `depends_on` entry rests on a trellis
> decision (0044) that is itself still `draft` and unmerged. See
> **Dependency on trellis decision-0044** below before treating this as
> settled. Filed to close
> [wisp#13](https://github.com/kodhama/wisp/issues/13).

## Context

wisp's `decisions/` and `specs/` directories are currently empty except
for their own contract READMEs (`decisions/README.md`, `specs/README.md`)
— no ADR has been filed here yet. Despite that, wisp's own source already
builds and **enforces** (not just narrates) a real invariant that
originates entirely outside this repo: math-quest's
`adr-0030-espalier` (status: `approved`, ratified by PR #170 merge,
2026-07-08). Concretely:

- `protocol.ts:4-7` — a header comment stating design constraints
  "inherited from ADR-0030: telemetry is self-reported CLAIMS, never a
  substitute for artifact-derived truth; absence of telemetry must be
  distinguishable from 'all quiet' (vacuity detection); failures are
  loud."
- `dashboard.html:353` — the dashboard's own UI badge, whose `title`
  attribute cites "ADR-0030" directly to justify the
  "self-reported telemetry" disclaimer shown to every viewer.

This is exactly the gap kodhama's 2026-07-10 family consistency-sweep
flagged (`kodhama/conductor/wave-consistency-sweep.md`, wisp section):
"`protocol.ts:5` and `dashboard.html:353` build and enforce ... a core
invariant ... grounded entirely in an ADR with zero footprint in wisp's
own corpus" — filed as [wisp#13](https://github.com/kodhama/wisp/issues/13)
and parked item #6 of that wave. The maintainer's call on that parked
item: file a local wisp decision formally referencing math-quest's
ADR-0030, using the qualified cross-repo reference form trellis's
decision-0044 proposes (see below), rather than wait for 0044 to land
first.

## Decision

Formally adopt, by qualified cross-repo reference, math-quest's
`adr-0030-espalier` as the upstream source of the following invariant,
which wisp's own code builds and enforces today:

> Telemetry is self-reported claims, never a substitute for
> artifact-derived truth. Absence of telemetry must be distinguishable
> from "all quiet" (vacuity detection). Failures are loud.

This decision's `depends_on` cites it as `math-quest/adr-0030-espalier`
— the qualified `repo/id` form trellis's decision-0044 proposes for
cross-repo references (see **Dependency on trellis decision-0044**).

### Invariants in wisp's code governed by this decision

These are the sites that **build and enforce** the invariant (tested,
not merely narrated), and are the ones this decision formally licenses:

- `protocol.ts:103-105` — `fail()`, which throws on any structural
  validation failure in `makeEvent` rather than swallowing or
  soft-failing it. This is the "failures are loud" half of the
  invariant.
- `protocol.ts:224-229` and `protocol.ts:347` — `TeamState.telemetry`,
  a boolean computed as `sorted.length > 0` and documented in the
  interface itself as a "vacuity guard: false means the bus carried NO
  events at all — which the consumer must render as 'no telemetry',
  never as 'all agents quiet'." This is the vacuity-detection half.
- `dashboard.html:353` — the UI's own self-reported-telemetry
  disclaimer badge, the human-facing surface of the same invariant,
  citing ADR-0030 directly.

### Other citations found (narrative, not separately governed)

A repo-wide check turned up several more ADR-0030 references that are
framing/provenance prose rather than enforced invariants: `demo.ts:2`,
`README.md:89`, `.claude/agents/dispatcher.md:24`,
`.claude/skills/grove-status/SKILL.md:11` (paraphrases the same
principle as "state derived from artifact existence, never agent
claims"), and `decisions/README.md:7`. Listed here so a future reader
can find every citation site in one place; this decision does not
separately certify them — see **Open questions**.

## Dependency on trellis decision-0044 (provisional)

This decision's `depends_on` entry uses the qualified `repo/id`
cross-repo reference form (`math-quest/adr-0030-espalier`) proposed by
trellis's **decision-0044** (PR #133, drafted 2026-07-10,
`status: draft` — not yet approved or merged). That decision:

- Proposes exactly this problem class as its motivating case — wisp's
  ADR-0030 citation is instance 3 in its own Context section, and its
  Consequences section explicitly names filing "wisp's own separate
  decision (sweep parked item #6)" as one live option it leaves
  unresolved. This decision is that filing.
- Still has its delimiter open (`:` vs `/`) — decision-0044's own text
  leans toward `/` ("mirrors the `org/repo`-style qualification the
  maintainer already reads daily") but has not settled it, and does not
  itself amend trellis's `spec-0001` allowlist (a follow-on
  contract-author pass, only after 0044 is approved, is expected to do
  that).
- Has not fixed which repos count as a "recognized" registry member —
  math-quest is the leading candidate but is explicitly flagged as not
  currently a declared kodhama family member.

Until decision-0044 is approved (and `spec-0001`'s external-reference
allowlist is amended to recognize the qualified form), this decision's
own `depends_on` entry is **not yet a valid reference** under trellis's
currently-ratified artifact contract — by the letter of that contract
today, it is itself a dangling reference, the same self-acknowledged
shape decision-0044 admits about its own citation of
`kodhama-0004-uniform-lifecycle`. That is accepted here on purpose,
matching the direction the maintainer already gave for this filing, not
silently glossed over.

**This decision's own `depends_on` entry is provisional pending trellis
decision-0044's approval; if 0044's mechanism changes materially before
it lands (delimiter flips, registry excludes math-quest, or the
qualified form is dropped for a different mechanism entirely), this
entry may need updating.**

## Why `status: draft`, not `gated`

- Rests on an unmerged, unapproved trellis decision whose exact
  mechanism (delimiter, registry membership) is still open.
- First artifact filed in wisp's `decisions/` corpus — no local
  self-check precedent, and no dedicated rubric yet (per
  `decisions/README.md`, only the base artifact contract exists to
  self-check against).
- Wants a maintainer read given both of the above before any
  self-certification to `gated`.

## Acceptance criteria

- [ ] A reader can find, from wisp's own `decisions/`, the exact
      upstream ADR that licenses `protocol.ts`'s telemetry-vacuity and
      loud-failure invariants, without needing to already know
      math-quest's corpus exists.
- [ ] `depends_on` cites `math-quest/adr-0030-espalier` using
      decision-0044's proposed qualified form.
- [ ] Every enforcing (tested) invariant site is named with a
      file:line anchor (`protocol.ts:103-105`, `protocol.ts:224-229`,
      `protocol.ts:347`, `dashboard.html:353`).
- [ ] The dependency on trellis decision-0044 and its provisional,
      not-yet-merged status are stated plainly, not assumed resolved.

## Open questions

- **Delimiter (`/` vs `:`)** is not this decision's call — it inherits
  whatever trellis decision-0044 settles. No action needed here beyond
  updating the citation if the delimiter flips before 0044 lands.
- **Should wisp's other, narrative-only ADR-0030 citations** (`demo.ts`,
  `README.md`, the agent/skill docs listed above) be pulled under this
  same decision's formal governance, or left as unlinked prose? Left
  unlinked for now — only the enforcing sites (`protocol.ts`,
  `dashboard.html`) are formally governed here. Revisit if a future
  audit wants full-corpus coverage.
- **Promotion path once decision-0044 lands**: if 0044's final form
  matches what's cited here, this decision's status can bump
  `draft → gated` (self-check) without a content edit. If 0044's
  mechanism changes materially, per this repo's append-only rule the
  right move is a new, superseding decision — not an in-place edit of
  this one.
