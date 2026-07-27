---
id: adr-0018-retire-the-marketplace-canary
type: adr
status: gated
depends_on:
  - adr-0006-codex-e2e-testing
  - adr-0007-codex-canary-evidence
  - adr-0011-node-24-only-support
  - adr-0014-retire-preview-qualification-machinery
owner: agent
updated: 2026-07-27
changes:
  - spec-0002-codex-e2e-testing@v9
---

# ADR-0018 — Retire the marketplace canary

## Decision state

### Decided

- Wisp retires the weekly Codex marketplace canary: its workflow,
  `scripts/codex-canary.mjs`, its `.d.mts`, and the driver's unit tests.
- **Two keyless pull-request gates now cover, at no API cost, every property
  the canary asserts except three.** §Context establishes this clause by
  clause; the second gate landed in PR #53 *after* the previous draft of this
  decision was written, and materially shrinks the gap.
- The three exceptions — **Codex-specific host launch**, **model mediation**,
  and **published-catalog install health** — become an accepted, named gap.
  They are not replaced.
- Wisp retains no scheduled workflow and no workflow requiring a host API key.
- **`writeSafeCanaryArtifacts`, `sanitizeCapabilityBytes` and
  `createOutputCollector` retire with it.** `extractCapabilities` is
  **un-exported, not removed** — see §The exports, which corrects a factual
  error in the previous draft.
- **`DEFAULT_OUTPUT_LIMIT_BYTES` has never had a test.** The previous draft
  required adding one "before the driver's tests go", on the premise that this
  change would destroy its evidence. That premise was false in both halves.
  See §The limit that was never evidenced.
- The mechanism is archived, loadable, at
  [`archive/codex-marketplace-canary`](https://github.com/kodhama/wisp/tree/archive/codex-marketplace-canary),
  and is never merged.

### Open

- None.

### Parked

- Whether Stewards adopts a family-level marketplace check, and in what form.
  Proposed as [`stewards#45`](https://github.com/kodhama/stewards/issues/45).
  **That is a Stewards decision and is not made here** — see §What this
  decision does not decide.
- A keyless *Codex* host-launch check, if one becomes possible. Today none is:
  `codex mcp list` and `codex plugin` read configuration without launching a
  server, which is why the gap below is Codex-shaped rather than host-generic.

## Context

The canary and the pull-request gates were assumed to test different things.
They now mostly do not — and the margin narrowed twice, once by re-reading the
container gate and once by PR #53 landing a second keyless gate.

**What the canary actually asserts.** Not a tool listing — `adr-0007:51-52`
established that `codex exec --json` emits `mcp_tool_call` items "but no
startup tool-inventory event". It asserts *completed* `mcp_tool_call` items for
`wisp_check`, `wisp_status` and `wisp_dashboard`, the exact canonical bus write,
live authenticated dashboard health, and transcript integrity.

**Gate one — the container end-to-end suite**, `test/e2e/codex-plugin.e2e.ts`,
keyless, every pull request. It connects an MCP client over stdio, launching the
server with `manifest.mcpServers.wisp.env_vars` (`:111`), `.command` (`:117`)
and `.args` (`:118`) read from the real Codex plugin manifest. It then asserts:

- the exact seven-tool inventory — `listTools()` (`:267-269`);
- the canonical **bus write**, by calling `wisp_status` and reading
  `.wisp/events.ndjson` back (`:279-295`, `:367-369`, `:389-398`);
- **authenticated dashboard health returning 200** (`:209-216`, `:331-332`); and
- cross-project isolation (`:287`, `:325-326`).

**Gate two — the keyless host check**, `scripts/keyless-host-check.mjs`, added
in PR #53 and run by the `keyless-host` job at `.github/workflows/ci.yml:51-67`.
Its own header states the boundary precisely (`:6-9`):

> What it establishes that nothing else does: `test/e2e/codex-plugin.e2e.ts`
> spawns the server itself from the manifest's values, so it cannot show that a
> *host* accepts the package and starts it. This runs the real
> `plugin marketplace add` → `plugin install` → `mcp list` path instead.

It asserts `Successfully added marketplace`, `Successfully installed plugin`,
`plugin:wisp:wisp:.*✔ Connected`, and that the connected server launched from
the *installed* payload rather than the source tree (`:68-87`).

**This is the finding that changes the decision.** The previous draft listed
"whether the host itself discovers and launches the server from the installed
manifest" as a property that "no static check establishes … at any cost, ever."
For the **Claude** host that is now false, keylessly, on every pull request. The
draft was written before PR #53 and never revised against it.

**What is left.** Three things, each narrower than the previous draft's version:

1. **Codex-specific host launch** — that *Codex* reads its manifest and spawns
   the server. Gate two proves this shape of property only for Claude, and the
   two bootstraps differ materially: Claude's `.mcp.json` runs
   `node ${CLAUDE_PLUGIN_ROOT}/dist/wisp.mjs`, while Codex's manifest runs an
   inline `node -e` loader resolving under `CODEX_HOME`. No keyless Codex
   equivalent exists.
2. **Model mediation** — that a model actually invokes the tools. Unreplaceable
   by any static check, on either host.
3. **Published-catalog install health** — that the *published* `@kodhama`
   catalog serves an installable package. Gate two installs from a local
   marketplace built from `plugins/wisp`, not from the published catalog. This
   is family distribution health; Wisp neither owns nor can fix that door.

`adr-0006:130-132` valued exactly this: drift in "Codex CLI, marketplace
discovery, plugin installation, and the host-managed MCP lifecycle without
spending model budget every night." That judgement was sound when the
deterministic gate proved less than it now does, and before a second keyless
gate existed at all.

## Decision

### The canary is retired

Wisp SHALL remove the scheduled canary workflow, `scripts/codex-canary.mjs`,
its `.d.mts`, and `test/e2e/codex-canary-driver-v2.unit.test.ts`. No Wisp
workflow SHALL run on a schedule, and none SHALL require a host API key.

### The exports

`writeSafeCanaryArtifacts` (`scripts/capability-safety.mjs:181` is its only
production caller's home, and `scripts/codex-canary.mjs:20,:760` its only
consumers) and `sanitizeCapabilityBytes` (reached only through
`writeSafeCanaryArtifacts`) SHALL be removed with their type declarations.
`createOutputCollector` is defined at `scripts/codex-canary.mjs:71` and
consumed only there and in the driver's tests; it goes with the file.

**`extractCapabilities` SHALL be un-exported, not removed.** The previous draft
asserted it had "the canary driver as its only production consumer" and set an
acceptance criterion requiring it "absent from `scripts/capability-safety.mjs`".
That was false and the criterion unsatisfiable: it is called at
`scripts/capability-safety.mjs:429-430`, inside `runSanitizedCommand`
(`:339`), which this decision explicitly retains, and again at `:62` inside
`sanitizeCapabilityBytes`. Only the `export` keyword and the `.d.mts`
declaration go.

`runSanitizedCommand` and `assertCapabilityAbsent` remain and keep their
coverage.

### The limit that was never evidenced

The previous draft carried a section requiring an assertion for
`DEFAULT_OUTPUT_LIMIT_BYTES` to be added *before* the driver's tests were
removed, "because its only assertion lives in the tests being deleted." Both
halves of that premise were false, and the correction is recorded here rather
than dropped:

- **No test asserts the constant, anywhere.** `git grep
  DEFAULT_OUTPUT_LIMIT_BYTES` returns five hits, all in `scripts/`, none under
  `test/`. The canary's test declares its own unrelated literal
  (`test/e2e/codex-canary-driver-v2.unit.test.ts:22`). This change therefore
  destroys no evidence, because none exists.
- **The properties the draft wanted preserved belong to a different
  function.** The shared-counter, whole-crossing-chunk and later-output
  assertions are made against `createOutputCollector`, the canary's own
  collector — not `runSanitizedCommand`. The two are not equivalent, so an
  "equivalent assertion" cannot be written: `createOutputCollector`
  (`codex-canary.mjs:83-88`) excludes the rejected chunk from its total and
  returns the accepted prefix, while `runSanitizedCommand`
  (`capability-safety.mjs:379-385`, `:402-413`) includes it and discards all
  output on overflow.

`runSanitizedCommand`'s own bounded-output failure IS tested, with an explicit
override, at `test/e2e/capability-safety-v6.unit.test.ts:322-336`; that test
survives. **That the default constant has no test is a real but pre-existing
gap that this change neither creates nor closes** — recorded as a follow-up
issue, not smuggled into a retirement decision.

### The spec revision

`spec-0002` SHALL be revised in place to `v9`. Canary-owned scenarios and
requirements (S6, S11, S16; R5, R6, R13, R19) are removed; the spec already
carries gaps at S7–S10 and R7–R12, so no surviving identifier is renumbered.

**S14 and R17 are edited, not removed**: each carries an "or either real Codex
smoke mode" disjunct that is dropped while the container half survives.

**S15 and R18 SHALL be rewritten, not merely trimmed.** The previous draft
grouped them with S14/R17 as carrying a droppable disjunct. They do not — and
the real problem is worse. Their normative subject is "the volatile command
collector", and their content ("accepts every prior whole chunk … persists at
most the previously accepted stdout prefix") describes `createOutputCollector`,
which this change deletes. Dropping a phrase would leave two clauses with **no
implementation asserting them**. They are rewritten to `runSanitizedCommand`'s
actual semantics: a shared raw budget across stdout and stderr, the crossing
chunk counted, and *no* output retained on overflow.

The verification-matrix row "Live Preview smoke" is wholly canary-owned and is
removed; the row "Node runtime preflights" is mixed and is edited. The `/proc`
identity-provider note that closes the canary section survives and relocates to
the gate section.

### The tests that lose their subject

`test/e2e/capability-safety-v6.unit.test.ts` loses five tests to the removals
above — three anchored to `sanitizeCapabilityBytes` (`:33`, `:58`, `:67`) and
two to `writeSafeCanaryArtifacts` (`:90`, `:121`). Its SPEC-0002 traceability
header (`:1`) cites S11 and R13, both of which this change removes, and SHALL be
re-derived. The previous draft never named this file.

### The lifecycle acts this change owes

Per `decisions/README.md:44-50`, this change SHALL add forward pointers to the
outgrown clauses of `adr-0006`, `adr-0007`, `adr-0011` and `adr-0014`, **each of
which stays `approved`.**

The previous draft required flipping `adr-0007` to `superseded`. That
contradicted both the repository rule — "For a partial change, keep the old
decision `approved` and add the same forward pointer naming the decision that
supersedes the affected part" (`:47-49`) — and the draft's own §Supersession,
which called the supersession partial. `adr-0007` already carries exactly this
shape of partial pointer for `adr-0014` at `:15-17` while remaining `approved`
(`:4`); this decision adds a second. `adr-0007` is also `owner: human`.

### What this decision does not decide

Whether Stewards owns a family-level marketplace check. Stewards' own approved
`0017` retains two narrow distribution goals and excludes "availability state"
and "clean-install certification"; `grove/adr-0034` AC3 limits Stewards
ownership to "marketplace-test metadata and CI marketplace/plugin setup
authoring." A successor may therefore require Stewards to widen that scope.

**That is Stewards' decision, made in Stewards, and this decision does not
assume its outcome.** Wisp's retirement stands on the coverage argument in
§Context, not on a successor existing.

## Supersession

All four decisions below stay `approved` and receive partial forward pointers.

**Partially supersedes `adr-0007-codex-canary-evidence`.** Its canary evidence
semantics retire. Its clause at `:23` — "The deterministic installed-plugin gate
owns the exact seven-tool inventory" — describes retained behaviour and
survives, independently restated by `adr-0014:116`. An earlier draft claimed
ADR-0007 was superseded *in full*, then claimed it should be flipped to
`superseded` while calling the supersession partial; both are corrected here.

**Partially supersedes `adr-0006-codex-e2e-testing`** — **seven clauses, not
one.** The previous draft named only `:132`, which was a significant undercount
and is corrected:

- `:37-39` — the top-level *Decided* clause: "The real Codex canary runs weekly
  against the current marketplace release for host drift and is also mandatory
  against the exact candidate before every marketplace release." The previous
  draft missed this entirely.
- `:126-128` — the `### Real-host release canary` section and its mandate.
- `:130-135` — both triggers, weekly and pre-release.
- `:137-141` — the isolated-`CODEX_HOME` execution requirements.
- `:143-148` — inconclusive-run handling and the non-optional release gate.
- `:169-174` — the Consequences clauses on canary retention and weekly cadence.

The deterministic gate, container and Playwright requirements, and the
insistence on reproducible rather than maintainer-attested evidence all remain.
`adr-0006:32-34` ("Codex's host-selected project binding") is **flagged, not
claimed**: the container gate sets `cwd` itself, and gate two's own header
records that `ProjectResolver.resolve()` is lazy so a handshake "says nothing
about which project the server bound to." Whether that clause is outgrown is
left open rather than resolved here.

`adr-0006:152-153` rejected "Playwright/Docker as the entire Codex e2e claim …
because it cannot exercise Codex's authenticated, prompt-driven host behavior."
**That remains true and this decision does not claim otherwise.** It accepts the
loss of prompt-driven host behaviour explicitly (§The gap), rather than
asserting the gates cover it.

**Partially supersedes `adr-0011-node-24-only-support`** — only `:70-71`, "The
independent browser E2E job and real-host canary remain unchanged and continue
to use their existing explicit Node.js 24 setup." The browser job is unchanged;
the canary is gone. Node 24 as sole runtime, CI line and bundle target is
untouched.

**Partially supersedes `adr-0014-retire-preview-qualification-machinery`** —
**five clauses** (the previous draft said "four" and then listed five): `:42-43`
("live host-drift smoke remain"), the "Live host smoke" section at `:126`,
`:198` ("Marketplace smoke detects ecosystem drift…"), `:214` (the rejected
alternative "Delete the live marketplace canary"), and `:236-237` (the
acceptance criterion requiring the live workflow to exist, unsatisfiable after
this change). Preview posture, the qualification retirement, the retained
product guarantees and the future-claims boundary all remain.

ADR-0014 rejected deleting the canary *"because real-host and marketplace drift
are not fully represented by deterministic local E2E."* That reasoning was
correct on the evidence then available. It is now **largely** overtaken: the bus
write and authenticated dashboard health it protected are represented by gate
one, and host acceptance-and-launch — the property closest to its concern — is
represented by gate two for Claude. What it protected that survives is
Codex-specific launch, model mediation, and published-catalog health; those are
accepted as losses below rather than argued away.

## The gap this decision accepts

Three properties lose all coverage and nothing in this repository replaces them:

- **Codex-specific host launch** — that Codex reads its installed manifest and
  spawns the server itself. No keyless mechanism exists: `codex mcp list` and
  `codex plugin` read configuration without launching anything.
- **Model mediation** — that a model actually calls the tools, on either host.
- **Published-catalog install health** — that the published `@kodhama` catalog
  serves an installable package.

If a published Wisp release silently stops being installable from the published
catalog, or stops being launchable by Codex specifically, nothing here will
notice. **The equivalent Claude-side failure would be caught**, which is the
change from the previous draft.

This is accepted on three grounds, each of which the maintainer should weigh
rather than take on assurance:

1. The coverage at risk is one plugin, and after PR #53 the largest piece of it
   — host acceptance and launch — is proven for one of the two hosts.
2. The mechanism survives loadable on the archive branch, so restoring it is a
   port, not a rebuild.
3. The alternative is an unbounded weekly key spend for a delta this decision
   cannot show is worth it — and `adr-0006:130-132` itself valued the check
   partly *because* it avoided "spending model budget every night."

**Re-open trigger.** If a Wisp release is found to be undiscoverable by Codex or
uninstallable from the published catalog, this decision is wrong and should be
revisited on that evidence. **Wisp's bar for re-adding a live smoke is a new
Wisp decision — deliberately low, and not gated on any Stewards outcome.**

## Consequences

- Wisp's CI surface becomes one workflow with three jobs — `fast`, `codex-e2e`
  and `keyless-host` — on pull requests and pushes to `main`, with no secret and
  no schedule.
- Codex host launch, model mediation, and published-catalog health are
  unmonitored from this change onward, with no scheduled end date.
- Claude host acceptance and launch remain monitored, keylessly, per pull
  request.
- Wisp's Codex support claim is unchanged — the canary never established it, and
  Preview posture already disclaims it.

## Rejected alternatives

### Keep the canary

Rejected on cost-for-delta, not on principle. After the coverage analysis in
§Context, its unique yield is the three items above, at a paid key weekly and
ongoing maintenance against Codex CLI drift. The decision would be different if
the two keyless gates did not already exercise the manifest's own bootstrap, the
bus write, authenticated dashboard health, and real host acceptance-and-launch.

### Keep it, but drop only the schedule

Rejected. A `workflow_dispatch`-only canary still needs maintaining against host
drift to stay runnable, and a check nobody runs provides no monitoring while
still costing review attention. The archive branch preserves the mechanism at
lower cost.

### Split it — retire the marketplace half, keep a Wisp-local live smoke

**Rejected, but the previous draft rejected it for a reason that has since
become false.** That draft argued the Wisp-side residue "still require[s] a paid
session". PR #53 then built exactly that residue, keylessly, for Claude. The
surviving argument is narrower: the residue that still needs a key is
Codex-specific launch plus model mediation, and a second key-spending workflow
to chase that is worse value than naming the gap. Where a keyless version is
possible, the answer is to build it — as PR #53 did — not to keep a paid one.

### Delete the mechanism outright

Rejected. It is the only worked example in the family of a marketplace being
installed and exercised on a headless runner with no interactive step, and a
successor is better served inheriting it than rediscovering it.

## Acceptance criteria

- No workflow in `.github/workflows/` carries a `schedule` trigger or reads a
  host API key secret.
- `scripts/codex-canary.mjs`, its `.d.mts`, the canary workflow, and
  `test/e2e/codex-canary-driver-v2.unit.test.ts` are absent.
- `writeSafeCanaryArtifacts` and `sanitizeCapabilityBytes` are absent from
  `scripts/capability-safety.mjs` and its `.d.mts`.
- **`extractCapabilities` is no longer exported and no longer declared in
  `scripts/capability-safety.d.mts`, while remaining callable at
  `scripts/capability-safety.mjs:429-430` inside `runSanitizedCommand`.**
- `test/e2e/capability-safety-v6.unit.test.ts` retains every test not anchored
  to a removed export, and its SPEC-0002 header cites only surviving
  identifiers.
- `spec-0002` is `v9`; no surviving scenario, requirement, or verification-matrix
  row references the canary; no surviving identifier is renumbered; S14/R17
  retain their container half; **S15 and R18 describe `runSanitizedCommand`'s
  actual overflow semantics, including that no output is retained**; the `/proc`
  note survives.
- `spec-0002`'s `implements:` no longer points at `adr-0014`.
- `test/test-deps.toml` drops `adr-0007-codex-canary-evidence` **and** bumps its
  spec pin to `spec-0002-codex-e2e-testing@v9`; the test that asserts that file
  byte-for-byte (`test/e2e/codex-e2e-strategy-v2.unit.test.ts:110-129`) is
  updated in the same commit.
- `test/e2e/codex-e2e-strategy-v2.unit.test.ts` no longer reads the deleted
  workflow or driver, and retains its Node 24 fast-gate and browser-gate
  assertions.
- **`adr-0006`, `adr-0007`, `adr-0011` and `adr-0014` all stay `approved`** and
  carry forward pointers on their outgrown clauses.
- `spec-0001` is either bumped or its non-impact recorded, given its five
  canary-naming rows (`:738-740`, `:1297-1298`, `:1775-1778`, `:2126-2132`,
  `:2182`), all of which are disjunctive except `:1297-1298`.
- A follow-up issue records that `DEFAULT_OUTPUT_LIMIT_BYTES` has no test.
- `npm run verify` passes, and the container end-to-end suite's assertions are
  **behaviourally** unchanged — verified by the suite passing, not by file bytes.
- The archive branch exists, is not merged, and its driver **loads** from a clean
  checkout.

## Self-check

- **Internal coherence:** the decision rests on a coverage comparison cited
  clause by clause against two gates, independently checkable, not on a framing.
- **Standing-decision conflicts:** four, each named with the specific clauses
  superseded — seven for `adr-0006`, five for `adr-0014` — and ADR-0014's
  contrary rejected alternative quoted rather than elided.
- **Honest gap:** three properties lose all coverage permanently, with no
  successor assumed and no end date. Stated as a loss, with the evidence that
  would prove it a mistake.
- **Where this could be wrong:** if Codex host launch drifts independently of
  the manifest values gate one exercises, ADR-0014's judgement was better than
  this one. The Claude half of that risk is now covered; the Codex half is not.
- **Scope:** no Stewards policy, no successor design, no support claim, and no
  change to either gate's behaviour.

## Lifecycle record

Authored 2026-07-27 from the maintainer's in-session direction to retire the
canary from Wisp and preserve the mechanism off `main`.

**Draft 1** argued the retirement on the ground that the canary tested family
distribution health rather than Wisp product behaviour. An independent adversary
returned `UNSOUND`: the canary does assert product properties, the archive did
not load, and the Stewards ownership assertion was not Stewards' to make.

**Draft 2** replaced that with a coverage argument against the container gate,
and returned `NEEDS-REVISION` with twelve defects. Independent verification of
its factual premises then refuted nine of them, four materially:

1. `extractCapabilities` is **not** canary-only — it is called inside the
   retained `runSanitizedCommand`, making draft 2's acceptance criterion
   unsatisfiable.
2. `DEFAULT_OUTPUT_LIMIT_BYTES` has **no test anywhere**, so the section draft 2
   devoted to preserving its evidence protected nothing; and the properties it
   described belong to `createOutputCollector`, not `runSanitizedCommand`.
3. Flipping `adr-0007` to `superseded` contradicts `decisions/README.md:47-49`
   **and** draft 2's own §Supersession.
4. `adr-0006`'s supersession was undercounted as one clause; it is seven,
   including a top-level *Decided* clause.

**The material change in draft 3** is none of those. It is that
`scripts/keyless-host-check.mjs` landed in PR #53 *after* draft 2 was written,
and proves host acceptance-and-launch for the Claude host, keylessly, on every
pull request. Draft 2 asserted no static check establishes that "at any cost,
ever." The gap this decision accepts is correspondingly narrower and
Codex-shaped, and the "split it" alternative is now rejected on a different
argument than draft 2 used, because draft 2's argument was falsified by work
merged in the interim.

Self-checked to `gated`. Awaiting independent decision-adversary review and the
maintainer's intent act.
