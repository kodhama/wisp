---
id: adr-0014-retire-preview-qualification-machinery
type: adr
status: gated
depends_on:
  - adr-0002-plugin-mcp-distribution
  - adr-0004-codex-session-bootstrap
  - adr-0005-plugin-dashboard-lifecycle
  - adr-0006-codex-e2e-testing
  - adr-0007-codex-canary-evidence
  - adr-0009-independent-plugin-package-metadata
  - adr-0010-preserve-marketplace-observation-provenance
  - adr-0011-node-24-only-support
  - adr-0012-receive-stewards-adoption-posture-strategy
  - adr-0013-receive-stewards-availability-support-grammar
owner: human
updated: 2026-07-26
changes:
  - spec-0001-plugin-mcp-distribution@v12
  - spec-0002-codex-e2e-testing@v8
---

# ADR-0014 — Retire aggregate qualification machinery while Wisp is Preview

## Decision state

### Decided

- Wisp's current distribution posture is **Preview**: its host-valid packages
  may be listed and installed, but Wisp makes no Supported claim.
- Wisp retires aggregate release qualification, its checked-in qualification
  ledger, and its checked-in exact-surface registry.
- Ordinary product quality, runtime safety, deterministic end-to-end tests,
  and live host-drift smoke remain.
- Node.js 24 remains Wisp's sole runtime requirement, CI line, and bundle
  target; that technical compatibility boundary is not a Supported claim.
- Any future Supported claim requires a new Wisp-local decision for the exact
  host and surface promise.
- The next changed package identity is `0.2.1-rc.4`.

The maintainer selected this direction in issue #48 and authorized its
implementation on 2026-07-26.

### Open

- None.

### Parked

- Any Supported claim for Claude Code, Codex, Windows, or another exact
  surface.
- A shared qualification schema, registry, validator, or release service.
- Generic CLI distribution and Windows support.

## Context

Wisp currently stores two aggregate certification records in its plugin
payload. `qualification.json` is a mutable release ledger joining bundle,
runtime, host, dashboard, marketplace, and overall results.
`surfaces.json` joins exact host rows back to that ledger and to optional
marketplace-observation records.

Those files do not make the plugin safer or more deterministic at runtime.
The repository's normal CI, installed-plugin Playwright suite, dashboard
security and recovery tests, and process-identity tests exercise those
properties directly. The two records instead make a Preview package carry
standing certification state whose principal effect is to block release until
every aggregate result is populated.

Stewards decision 0021 permits a host-valid plugin to remain listed as Preview
with explicit non-support disclosure. Decision 0023 constrains every
machine-readable exact-surface row Wisp declares, but requires no common file
path or row. ADR-0012 and ADR-0013 received those constraints locally.
Removing Wisp's current rows is therefore conformant; any future rows remain
bound by the common availability/support grammar.

## Decision

### Preview, not aggregate certification

Wisp SHALL describe its current adoption posture as Preview and SHALL NOT make
an affirmative Supported claim. Marketplace presence, successful
installation, ordinary CI, deterministic E2E, or a live smoke run do not by
themselves create support.

The Stewards marketplace listing or its linked Wisp product documentation
SHALL state explicitly that support is not claimed. Wisp's distributed README
SHALL carry that disclosure so it remains true even when the package is
viewed outside the marketplace.

Wisp SHALL remove `plugins/wisp/qualification.json` and
`plugins/wisp/surfaces.json` from the distributed payload. No build, test,
workflow, release, or documentation path SHALL require or mutate an aggregate
qualification result, a qualification digest, a disclosure matrix, a
marketplace-observation join, or a support-like surface row.

### Retained product guarantees

This retirement does not weaken the plugin contract. Wisp SHALL retain:

- Node.js 24 as its one runtime requirement, CI line, and bundle target,
  without interpreting technical compatibility as a Supported claim;
- one self-contained dual-host plugin with equal Claude and Codex package
  versions and `plugins/wisp/VERSION` as version authority;
- normal typecheck, unit, build, plugin-validation, and deterministic
  Docker/Playwright E2E gates;
- the seven-tool MCP inventory, project binding and confinement, exact bus
  reads/writes, lazy project-singleton dashboard, cross-project isolation,
  authenticated HTTP boundary, cleanup and recovery behavior, and
  process-identity protections; and
- capability-safe handling of host and browser evidence.

“Qualified process identity” remains a runtime safety term. It is not part of
the retired release-qualification machinery and SHALL NOT be removed or
renamed under this decision.

### Live host smoke

The Codex marketplace canary remains useful as drift detection. Weekly and
manual runs SHALL continue to install from a declared marketplace source and
exercise representative read, write, dashboard, health, bus-path, and
model-mediated host behavior.

The workflow SHALL describe a manual run as Preview smoke rather than
candidate qualification. It SHALL NOT require a candidate version or bundle
digest input, invoke an exact-candidate verifier, mutate checked-in evidence,
or claim release/support proof. A smoke failure still fails the run; the
weekly path may preserve its existing inconclusive outcome for an external
host or marketplace outage.

### Future claims and metadata

Any future Supported claim requires a new Wisp-local decision that names the
exact host and surface promise, limitations, evidence, and renewal policy.
If Wisp later declares machine-readable exact-surface rows, each row SHALL
follow the Stewards 0023 availability/support grammar received by ADR-0013.

No common qualification schema, global validator, or Stewards policy change
is introduced here.

### Package identity

The changed payload SHALL advance to `0.2.1-rc.4`. `plugins/wisp/VERSION`,
both host manifests, root package metadata, lock metadata, server identity,
generated bundle, tests, and the Codex cache path SHALL remain consistent
where each is an existing version carrier. Aggregate qualification and
surface metadata are no longer version carriers.

## Partial supersession

This decision supersedes only:

- ADR-0002's aggregate qualification policy, checked-in
  `qualification.json`, release-pass gate, and “separately qualified”
  wording;
- ADR-0004's exact-candidate marketplace-install qualification requirement
  and future-qualification language, while preserving its host-selected
  session-directory bootstrap and version/cache equality;
- ADR-0005's live-qualification and release-support requirements, while
  preserving every dashboard lifecycle and security guarantee;
- ADR-0006 (`codex-e2e-testing`) candidate-release gate, exact-candidate
  verifier, and ten-path staging requirement, while preserving deterministic
  installed-plugin E2E;
- ADR-0007's candidate qualification/evidence semantics, while preserving its
  observable real-Codex smoke boundaries;
- ADR-0009's checked-in qualification/surface carriers, ten-path inventory,
  observation joins, and qualification-dependent release posture, while
  preserving independent Wisp version authority;
- ADR-0010 in full because its only active behavior is Wisp's consumption and
  validation of marketplace observations through the retired surface
  metadata; the distinction between an observation and a support claim
  remains a governing Stewards boundary; and
- ADR-0011's affirmative support claim, qualification-ledger, and aggregate
  release-qualification clauses, while preserving Node.js 24 as the sole
  runtime requirement, CI line, and bundle target; and
- ADR-0013's statement that current qualification metadata remains unchanged,
  while preserving its constraint on any future exact-surface metadata.

All unaffected distribution, runtime, dashboard, security, E2E, version, and
Node.js decisions remain current.

## Consequences

- The distributed payload returns from ten paths to eight.
- Package builds become reproducible outputs rather than mutations of a
  certification ledger.
- Preview releases remain subject to substantive CI and E2E without requiring
  an aggregate cross-host “pass” record.
- Marketplace smoke detects ecosystem drift without being represented as
  support evidence.
- A future support promise incurs deliberate, claim-scoped evidence work
  instead of reviving an implicit global qualification program.

## Rejected alternatives

### Keep empty qualification and surface files for future compatibility

Rejected because no retained runtime or external consumer requires either
carrier after this decision's authorized cleanup. The current build, static
tests, E2E staging, and canary do consume them, but only to enforce the
qualification machinery this decision retires. Empty records would preserve
that maintenance cost and invite readers to infer a certification contract
that Preview Wisp does not make.

### Delete the live marketplace canary

Rejected because real-host and marketplace drift are not fully represented by
deterministic local E2E. The useful smoke remains after its release-gate and
support-evidence semantics are removed.

### Remove host-specific behavior tests with qualification

Rejected because dashboard singleton, security, isolation, bus, and
process-identity properties are product behavior and safety guarantees, not
certification paperwork.

## Acceptance criteria

- The distributed payload has exactly eight paths and contains neither
  `qualification.json` nor `surfaces.json`.
- No source, test, build, workflow, or documentation path reads, writes, or
  requires either retired file.
- The exact-candidate verifier and its verifier-only tests are absent.
- Node.js 24, version-carrier parity, dual-host manifests, normal CI,
  deterministic E2E, runtime safety, and dashboard security/recovery tests
  remain enforced.
- The live Codex workflow exposes weekly and manual Preview smoke without
  candidate version/digest inputs or qualification language.
- All package-version carriers identify `0.2.1-rc.4`.
- The distributed Wisp README explicitly identifies the package as Preview
  and states that support is not claimed; the Stewards listing either carries
  the same disclosure or links to it.
- Future-surface documentation retains the Stewards 0023 grammar constraint.

## Self-check

- **Internal coherence:** the decision removes aggregate certification state,
  not the tests and runtime invariants that establish product quality.
- **Standing-decision conflicts:** ADR-0012 permits Preview distribution and
  ADR-0013 requires common fields only when Wisp declares future exact-surface
  rows. Neither requires the retired files.
- **Scope:** no Stewards schema, Windows support, generic CLI, unrelated
  dashboard behavior, or Supported claim is introduced.
- **Verification:** the acceptance criteria separate deleted certification
  carriers from retained behavioral and security gates.

## Lifecycle record

The shaper converged the issue #48 direction into this decision after the
Stewards conformance preflight returned `PASS`. The self-check found no open
intent item, preserved every runtime and security stop condition, and made the
partial-supersession boundary explicit; the record therefore moved to
`gated` for independent decision-adversary review.

The first decision-adversary pass returned `NEEDS-REVISION` at commit
`346bb8a`: Node.js support was both prohibited and preserved, explicit Preview
non-support disclosure was not required, and one rationale denied the current
local consumers being retired. This revision supersedes the affirmative Node
support claim while preserving its technical runtime boundary, makes the
disclosure testable, and distinguishes current qualification-only consumers
from retained runtime or external consumers.
