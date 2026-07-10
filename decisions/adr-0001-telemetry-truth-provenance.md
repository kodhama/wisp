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
> decisions (per `decisions/README.md`, only the base contract exists).
>
> **Update (2026-07-10, post-drafting):** the blocker this decision was
> originally provisional on is now cleared. Trellis's decision-0044 is
> `status: approved` on trellis's `main` (merged via PR #133, then bumped
> `gated → approved` via PR #136), and `specs/0001-spine-artifact-contract.md`
> §1 has been amended accordingly (PR #137, merged) to recognize the
> qualified `<repo>/<id>` external-ref form, with a registry that
> explicitly includes math-quest. This decision's `depends_on` entry
> (`math-quest/adr-0030-espalier`) matches that ratified form exactly
> (same delimiter, math-quest genuinely in the registry) and is now a
> **genuinely valid** external reference — no longer a dangling one. See
> **Dependency on trellis decision-0044** below, updated to reflect this.
> The remaining reasons to stay in `draft` (no local self-check precedent
> or rubric yet) are unaffected by this update — see **Why `status: draft`,
> not `gated`**. Filed to close
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

## Dependency on trellis decision-0044 (now resolved)

This decision's `depends_on` entry uses the qualified `repo/id`
cross-repo reference form (`math-quest/adr-0030-espalier`) proposed by
trellis's **decision-0044**. As of 2026-07-10, that decision is
`status: approved` (merged via PR #133, bumped `gated → approved` via
PR #136), and its mechanism has landed exactly as this decision
anticipated:

- Its motivating case: wisp's ADR-0030 citation was instance 3 in
  decision-0044's own Context section, and its Consequences section
  named filing "wisp's own separate decision (sweep parked item #6)" as
  a live option. This decision is that filing.
- **Delimiter — resolved: `/`.** Decision-0044's Open Questions record
  the maintainer's 2026-07-10 choice of `/` over `:`, and
  `spec-0001` §1 (amended via PR #137, merged) now recognizes exactly
  the `<repo>/<id>` form — matching this decision's own
  `math-quest/adr-0030-espalier` citation verbatim.
- **Registry membership — resolved: math-quest is in.** Decision-0044's
  Open Questions record the maintainer's choice of "kodhama's declared
  family list PLUS math-quest," and `spec-0001` §1 now lists the
  registry inline as "kodhama, trellis, grove, wisp, design-system,
  homebrew-tap, math-quest" — math-quest genuinely included, read
  directly from the ratified spec text, not assumed.

Because both the delimiter and registry membership now match this
decision's citation exactly, this decision's own `depends_on` entry
**is a valid reference** under trellis's currently-ratified artifact
contract — no longer a dangling one. (Resolution depth is still
shape + registry-membership only per `spec-0001` §1, matching
`brief-§…`'s existing non-verified treatment — no fetch-and-confirm-the-
referent-exists mechanism; that was never in question for this entry.)

## Why `status: draft`, not `gated`

- ~~Rests on an unmerged, unapproved trellis decision whose exact
  mechanism (delimiter, registry membership) is still open.~~ **No
  longer applies (2026-07-10):** decision-0044 is now `approved` and its
  mechanism (delimiter `/`, registry including math-quest) matches this
  decision's citation exactly — see **Dependency on trellis
  decision-0044** above.
- First artifact filed in wisp's `decisions/` corpus — no local
  self-check precedent, and no dedicated rubric yet (per
  `decisions/README.md`, only the base artifact contract exists to
  self-check against). **Still applies.**
- Wants a maintainer read given both of the above before any
  self-certification to `gated`. **Still applies** — this update
  clears the trellis-side blocker but does not itself constitute the
  maintainer read or a self-certification; status is left at `draft`
  pending that.

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
- [x] The dependency on trellis decision-0044 is stated plainly,
      including its status — originally provisional/not-yet-merged at
      drafting time, now `approved` with a matching mechanism as of
      2026-07-10 (see **Dependency on trellis decision-0044**), not
      silently assumed either way.

## Open questions

- **Delimiter (`/` vs `:`)** was not this decision's call — it inherited
  whatever trellis decision-0044 settled. **Resolved 2026-07-10:** `/`,
  matching this decision's existing citation; no update needed.
- **Should wisp's other, narrative-only ADR-0030 citations** (`demo.ts`,
  `README.md`, the agent/skill docs listed above) be pulled under this
  same decision's formal governance, or left as unlinked prose? Left
  unlinked for now — only the enforcing sites (`protocol.ts`,
  `dashboard.html`) are formally governed here. Revisit if a future
  audit wants full-corpus coverage.
- **Promotion path once decision-0044 lands**: if 0044's final form
  matches what's cited here, this decision's status can bump
  `draft → gated` (self-check) without a content edit. **Decision-0044
  has now landed (2026-07-10, approved) and its final form does match
  what's cited here** (delimiter `/`, math-quest in the registry) — so
  the trellis-side precondition for a `draft → gated` bump is satisfied.
  That bump is deliberately **not** done as part of this update: it is a
  separate self-certification act (per **Why `status: draft`, not
  `gated`** above, the other reasons — no local self-check precedent,
  no dedicated rubric, wanting a maintainer read — still hold) and is
  left for that self-check step or the maintainer, not asserted here.
