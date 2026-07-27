---
id: adr-0018-retire-the-marketplace-canary
type: adr
status: approved  # maintainer's explicit intent act in conversation, 2026-07-27: "about the canary, just retire it then"
depends_on:
  - adr-0006-codex-e2e-testing
  - adr-0007-codex-canary-evidence
  - adr-0011-node-24-only-support
  - adr-0014-retire-preview-qualification-machinery
  - adr-0017-bound-preview-directory-lock-contract
owner: agent
updated: 2026-07-27
changes:
  - spec-0002-codex-e2e-testing@v9
  - spec-0001-plugin-mcp-distribution@v16
---

# ADR-0018 — Retire the marketplace canary

## Decision state

### Decided

- Wisp retires the weekly Codex marketplace canary: its workflow,
  `scripts/codex-canary.mjs`, its `.d.mts`, and the driver's unit tests.
- **This is a cost-for-value trade, not a redundancy claim.** Three earlier
  drafts argued the canary was covered by the deterministic gates. It is not,
  and §Why the coverage argument was wrong records that failure rather than
  burying it.
- **Host-drift detection loses all coverage, on both hosts.** That is the
  canary's chartered purpose (`adr-0006:130-132`) and the single largest loss
  here. It is named, not argued away.
- The **`codex exec --json` transcript and `mcp_tool_call` item contract**,
  **model mediation**, **Codex host launch**, and **published-catalog install
  health** also lose all coverage. See §The gap this decision accepts.
- What the two keyless gates *do* retain is behavioural coverage at a pinned
  host version: the seven-tool inventory, the canonical bus write,
  authenticated dashboard health, cross-project isolation, and — since
  [#53](https://github.com/kodhama/wisp/pull/53) — real host acceptance and MCP
  launch on Claude. **None of that is drift detection**, by construction.
- Wisp retains no scheduled workflow and no workflow requiring a host API key.
- **`writeSafeCanaryArtifacts`, `sanitizeCapabilityBytes` and
  `createOutputCollector` retire with it.** `extractCapabilities` is
  **un-exported, not removed** — it is called inside the retained
  `runSanitizedCommand`.
- The mechanism is archived, loadable, at
  [`archive/codex-marketplace-canary`](https://github.com/kodhama/wisp/tree/archive/codex-marketplace-canary),
  and is never merged.

### Open

- None. The `adr-0006:32-34` project-binding clause is resolved in
  §Supersession rather than left dangling.

### Parked

- A product-side host-drift check for Wisp, tracked as
  [`wisp#55`](https://github.com/kodhama/wisp/issues/55). Its marketplace-side
  sibling is [`stewards#45`](https://github.com/kodhama/stewards/issues/45).
  Neither is assumed by this decision.

## Context

The canary runs one `codex exec --json` turn a week against the published
marketplace, on an isolated `CODEX_HOME`, and asserts completed `mcp_tool_call`
items for `wisp_check`, `wisp_status` and `wisp_dashboard`, the exact canonical
bus write, live authenticated dashboard health, and transcript integrity.

Its chartered job is drift. `adr-0006:130-132`:

> A weekly scheduled run installs the current marketplace release. It detects
> drift in Codex CLI, marketplace discovery, plugin installation, and the
> host-managed MCP lifecycle without spending model budget every night.

That job is real and nothing else in this repository does it. The trade is
therefore not "is this redundant" but "is one plugin's weekly drift signal, on
one host, worth a paid model turn and ongoing maintenance against Codex CLI
churn, at this stage of the family's life."

**The maintainer's answer is no**, on 2026-07-27, with the mechanism preserved
and a successor logged rather than assumed. The family is consolidating; a
weekly paid check on a Preview plugin that claims no Codex support is not where
the remaining budget goes.

## Why the coverage argument was wrong

Recorded because three drafts made it, and it would otherwise be made a fourth
time.

Drafts 1–3 argued the canary was redundant against the deterministic container
gate and, in draft 3, against the keyless host check added in #53. **Drift is a
temporal property.** Both gates run per pull request against a pinned host —
`.github/workflows/ci.yml:66` pins `@anthropic-ai/claude-code@2.1.220` — and the
keyless job's own comment (`ci.yml:48-50`) says so explicitly:

> The CLI is pinned so a pull request fails for its own reasons, never for an
> upstream release. Detecting host drift is a scheduled, cross-plugin concern
> and belongs to kodhama/stewards#45, not to this gate.

Draft 3 cited `keyless-host-check.mjs` as evidence of coverage while that
sentence sat three lines below the code it quoted. A pinned per-PR gate cannot
observe that a *new* host release broke the plugin, by construction. Draft 3
also enumerated four canary-asserted properties and assigned coverage for three,
leaving transcript integrity uncovered and unnamed inside an "everything except
three" claim.

`adr-0014:216-217` rejected this same deletion *"because real-host and
marketplace drift are not fully represented by deterministic local E2E."*
**That sentence is still true.** #53 changed its acceptance half, on the other
host; it did not touch the drift half. This decision overrides `adr-0014`'s
judgement on cost grounds, and says so, rather than claiming the evidence
changed.

## Decision

### The canary is retired

Wisp SHALL remove the scheduled canary workflow, `scripts/codex-canary.mjs`,
its `.d.mts`, and `test/e2e/codex-canary-driver-v2.unit.test.ts`. No Wisp
workflow SHALL run on a schedule, and none SHALL require a host API key.

### The exports

`writeSafeCanaryArtifacts` (defined at `scripts/capability-safety.mjs:166`) and
`sanitizeCapabilityBytes` (defined at `:59`, reached in production only through
`writeSafeCanaryArtifacts` at `:181`) SHALL be removed with their type
declarations and the tests anchored to them. `createOutputCollector` is defined
at `scripts/codex-canary.mjs:71` and goes with that file.

**`extractCapabilities` SHALL be un-exported, not removed.** It is called inside
`runSanitizedCommand`, which this decision retains, and inside
`sanitizeCapabilityBytes`, which it does not. Only the `export` keyword and the
`.d.mts` declaration go. No test imports it, so nothing breaks.

`runSanitizedCommand` and `assertCapabilityAbsent` remain and keep their
coverage.

### The 4,194,304-byte boundary loses its only test

`spec-0002` requires, normatively, that one shared counter accept exactly
4,194,304 mixed stdout/stderr bytes and reject the whole crossing chunk. The
only test of that exact value is
`test/e2e/codex-canary-driver-v2.unit.test.ts:527-546`, against
`createOutputCollector`. Both are deleted here.

`runSanitizedCommand` has a shared budget with different semantics — it counts
the crossing chunk (`capability-safety.mjs:380-381`) and retains **no** output on
overflow (`:406-412`), where the collector excluded the chunk and returned the
accepted prefix. Its bounded-output failure is tested with an explicit
`maxOutputBytes: 10` override at `test/e2e/capability-safety-v6.unit.test.ts:333`
and survives; its behaviour at the 4 MiB default is not tested and will not be.

**This is stated as a loss, not repaired here.** `DEFAULT_OUTPUT_LIMIT_BYTES`
(`capability-safety.mjs:13`) has no direct test and never had one — `git grep`
returns five hits, all under `scripts/`. Adding one is logged on `wisp#55`, not
smuggled into a retirement.

### The spec revision

`spec-0002` SHALL be revised in place to `v9`. Canary-owned scenarios and
requirements (S6, S11, S16; R5, R6, R13, R19) are removed; the spec already
carries gaps at S7–S10 and R7–R12, so no surviving identifier is renumbered.

- **S14 and R17** each carry an "or either real Codex smoke mode" disjunct that
  is dropped while the container half survives.
- **S15 and R18 SHALL be rewritten**, not trimmed. S15's subject is "the
  volatile command collector" and R18's is a spawned command's shared budget;
  both describe `createOutputCollector`. They are rewritten to
  `runSanitizedCommand`'s actual semantics — shared raw budget, crossing chunk
  counted, no output retained — and R18's "abort callbacks" clause is dropped,
  because `runSanitizedCommand` has no callback mechanism.
- **Prose outside the scenario/requirement structure** also goes: the
  `## Real Codex canary` section, the canary sentences in `## Scope`, the canary
  rows under `## Required repository surfaces`, and the canary clauses of the
  test-ledger prose.
- **Verification matrix**: the `Live Preview smoke` row is removed; the
  `Node runtime preflights` row is edited; the **`Capability-safe artifacts` row
  is rewritten**, because its shared-counter and artifact-retention clauses
  describe the two deleted functions end to end.
- The `/proc` identity-provider note survives and relocates to the gate section.

`spec-0001` SHALL be bumped to `v16`. Its verification row at `:2182` is
**conjunctive** — "Host-smoke, canary, and Playwright-failure fixtures prove …"
— so deleting the canary fixtures falsifies it, and `R94` (`:2163-2168`)
requires retaining "canary repairs". Recording non-impact is not available.

### The tests that lose their subject

`test/e2e/capability-safety-v6.unit.test.ts` loses five tests — three anchored
to `sanitizeCapabilityBytes` (`:33`, `:58`, `:67`) and two to
`writeSafeCanaryArtifacts` (`:90`, `:121`). Its traceability header (`:1`) cites
S11 and R13, both removed. `test/e2e/codex-e2e-strategy-v2.unit.test.ts`'s
header (`:1`) cites S6, R5 and R6, all removed. Both headers SHALL be re-derived
and both `@v8` pins updated.

### The lifecycle acts this change owes

Per `decisions/README.md:47-49` — "For a partial change, keep the old decision
`approved` and add the same forward pointer naming the decision that supersedes
the affected part" — **every decision below stays `approved`** and receives a
partial forward pointer. None is flipped to `superseded`.

## Supersession

**`adr-0006-codex-e2e-testing`** — six clauses: `:37-39` (the top-level *Decided*
clause mandating the weekly and pre-release canary), `:126-128` (the
`### Real-host release canary` heading and mandate), `:130-135` (both triggers),
`:137-141` (the isolated-`CODEX_HOME` execution requirements), `:143-145`
(inconclusive-run handling and the non-optional release gate), and `:169-174`
(the Consequences clauses on canary retention and weekly cadence).
`adr-0006:146-148`, the `/proc` macOS-qualification note adjacent to that fifth
region, **survives** and is preserved in spec-0002.

`adr-0006:32-34` requires the strategy to exercise "Codex's host-selected
project binding". The container gate sets `cwd` itself, and #53's own header
records that `ProjectResolver.resolve()` is lazy, so a handshake proves nothing
about binding. **That clause is outgrown and is superseded too** — listed here
rather than left open.

`adr-0006:152-153` rejected "Playwright/Docker as the entire Codex e2e claim …
because it cannot exercise Codex's authenticated, prompt-driven host behavior."
**That remains true and this decision does not claim otherwise.**

**`adr-0007-codex-canary-evidence`** — its canary evidence semantics retire. Its
clause at `:23`, "The deterministic installed-plugin gate owns the exact
seven-tool inventory", describes retained behaviour and survives, independently
restated by `adr-0014:116`. `adr-0007` is `owner: human` and already carries a
partial forward pointer for `adr-0014` at `:15-17`; this adds a second.

**`adr-0011-node-24-only-support`** — only `:70-71`, "The independent browser E2E
job and real-host canary remain unchanged and continue to use their existing
explicit Node.js 24 setup." The browser job is unchanged; the canary is gone.

**`adr-0014-retire-preview-qualification-machinery`** — five clauses: `:42-43`
("live host-drift smoke remain"), the "Live host smoke" section at `:126`, `:198`
("Marketplace smoke detects ecosystem drift…"), `:214` (the rejected alternative
"Delete the live marketplace canary"), and `:236-237` (the acceptance criterion
requiring the live workflow to exist).

**`adr-0017-bound-preview-directory-lock-contract`** (`:34-36`, `:74-75`,
`:114-117`) — it requires PR #49 to retain its "canary repairs". The repairs
were real; their carrier is removed.

**`adr-0015` and `adr-0016` need no pointer from here.** Both are already
`superseded` along a clean chain — 0015 → 0016 → 0017 — and each already
carries a forward pointer, so no reader lands on their canary clauses without
being routed to `adr-0017`, which this decision does annotate. An earlier
version of this decision listed all three as `approved`; that was wrong, and
checking rather than asserting it is what caught it. `adr-0015`'s acceptance
criterion resting on the deleted canary-driver regression reaches the reader
through that same chain.

## The gap this decision accepts

Five properties lose all coverage and nothing in this repository replaces them:

1. **Host drift, both hosts** — that a *new* Codex or Claude release still works
   with the published plugin. The canary's chartered purpose. Nothing per-PR and
   pinned can observe it.
2. **The `codex exec --json` transcript and `mcp_tool_call` item contract** —
   turn ordering, item schema, `error === null`, structured-content shape. Only
   `scripts/codex-canary.mjs` and its test reference it.
3. **Model mediation** — that a model actually invokes the tools.
4. **Codex host launch** — that Codex reads its installed manifest and spawns the
   server. No keyless mechanism exists: `codex mcp list` and `codex plugin` read
   configuration without launching anything.
5. **Published-catalog install health** — including the single-version cache
   resolution the canary asserted at `codex-canary.mjs:452-461`.

If a published Wisp release silently stops working with a new Codex release,
**nothing here will notice**.

This is accepted on three grounds:

1. Wisp is Preview and claims no Codex support; the canary never established one.
2. The mechanism survives loadable on the archive branch — verified by loading it
   from a fresh clone — so restoring it is a port, not a rebuild.
3. The family is consolidating, and a weekly paid check on one plugin is not
   where the remaining budget goes. This is a stage judgement and is expected to
   be revisited.

**Re-open trigger.** Any report that a Wisp release stopped working with a host
release, or `wisp#55` being picked up. **Wisp's bar for re-adding a live smoke is
a new Wisp decision — deliberately low, and not gated on any Stewards outcome.**

## Consequences

- Wisp's CI surface becomes one workflow with three jobs — `fast`, `codex-e2e`
  and `keyless-host` — with no secret and no schedule.
- The five properties above are unmonitored from this change onward, with no
  scheduled end date.
- `spec-0002`'s 4,194,304-byte boundary is normative with no test at that value.
- Wisp's Codex support claim is unchanged.

## Rejected alternatives

### Keep the canary

Rejected on cost at this stage, **not** on redundancy — the earlier drafts'
error. Its unique yield is the five properties above, genuinely uncovered. Cost
is one weekly job, `timeout-minutes: 20`, one `codex exec --json` turn with
`EXEC_TIMEOUT_MS = 300_000` and `--ephemeral`: bounded and small, but paid and
maintained against Codex CLI churn. The maintainer's call is that a consolidating
family spends that elsewhere.

### Keep it, but drop only the schedule

Rejected. Drift detection *is* the schedule; a `workflow_dispatch`-only canary
retains the maintenance burden and delivers none of the value.

### Split it — retire the marketplace half, keep a Wisp-local live smoke

Rejected. The Wisp-side residue still needs a paid session for model mediation
and Codex launch, so the split buys a second key-spending workflow for a subset
of the same properties.

### Delete the mechanism outright

Rejected. It is the only worked example in the family of a marketplace being
installed and exercised on a headless runner with no interactive step.

## Acceptance criteria

- No workflow in `.github/workflows/` carries a `schedule` trigger or reads a
  host API key secret.
- `scripts/codex-canary.mjs`, its `.d.mts`, the canary workflow, and
  `test/e2e/codex-canary-driver-v2.unit.test.ts` are absent.
- The functions `writeSafeCanaryArtifacts` and `sanitizeCapabilityBytes` are
  absent from `scripts/capability-safety.mjs` and its `.d.mts`.
- **The function `extractCapabilities` is defined but not exported in
  `scripts/capability-safety.mjs`, is absent from the `.d.mts`, and is still
  called by `runSanitizedCommand`.** *(Stated against the functions, not line
  numbers, because this change shifts them.)*
- `test/e2e/capability-safety-v6.unit.test.ts` retains every test not anchored to
  a removed export; both it and `test/e2e/codex-e2e-strategy-v2.unit.test.ts`
  cite only surviving identifiers in their headers and pin `@v9`.
- `git grep -i canary` returns hits only in `decisions/`, in the specs'
  append-only amendment banners and gate records, in this decision's own
  amendment notes, and in the three surviving *disjunctive* spec-0001 clauses
  ("a host smoke, canary, **or** browser harness") — no workflow, script, test,
  live spec clause, matrix row, or scope prose.
- `spec-0002` is `v9`; S15/R18 describe `runSanitizedCommand`'s semantics
  including that no output is retained; the `Capability-safe artifacts` matrix
  row no longer describes deleted functions; the `/proc` note survives.
- `spec-0002`'s `implements:` no longer points at `adr-0014`.
- `spec-0001` is `v16` with its `:2182` row and `R94` reconciled.
- `test/test-deps.toml` drops `adr-0007-codex-canary-evidence` and bumps both
  spec pins; the byte-exact assertion at
  `test/e2e/codex-e2e-strategy-v2.unit.test.ts:110-129` is updated in the same
  commit.
- **`adr-0006`, `adr-0007`, `adr-0011`, `adr-0014` and `adr-0017` all stay
  `approved`** and carry partial forward pointers. `adr-0015` and `adr-0016`
  are already `superseded` and already routed forward; they are not touched.
- `npm run verify` passes.
- The archive branch exists, is not merged, and its driver loads from a clean
  checkout.

## Lifecycle record

Authored 2026-07-27. **Approved by the maintainer's explicit intent act the same
day:** *"about the canary, just retire it then, and if you think the idea has
value, log it as an issue for future work … but it's not worth more tokens ATM.
we want this to stabilize."*

Four drafts. Draft 1 returned `UNSOUND` — it argued the canary tested family
distribution rather than product behaviour, which was false. Draft 2 returned
`NEEDS-REVISION` with twelve defects, and independent premise verification then
refuted nine of its claims, including two unsatisfiable acceptance criteria.
Draft 3 rewrote those corrections and returned `NEEDS-REVISION` again with two
fatal defects.

**All three failed the same way**: each argued the canary was *redundant*, and
each was refuted by reading what the replacement mechanisms say they do not
prove. Draft 3's version cited a CI comment written days earlier in this same
repository — "Detecting host drift is … not to this gate" — as evidence of
coverage.

This draft abandons the redundancy argument entirely. The canary is not
redundant; it is being retired because its value does not justify its cost at
this stage. The losses it concedes are larger, and more honestly stated, than
any previous draft's.
