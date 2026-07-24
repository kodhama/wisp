---
id: adr-0008-retire-family-release-certification
type: adr
status: approved
depends_on:
  - adr-0002-plugin-mcp-distribution
  - adr-0004-codex-session-bootstrap
  - adr-0005-plugin-dashboard-lifecycle
  - adr-0006-family-plugin-release-and-surface-contract
  - adr-0007-codex-canary-evidence
owner: agent
updated: 2026-07-24
---

# ADR-0008 — Retire family release certification

## Decision state

### Decided

- Wisp retires `adr-0006-family-plugin-release-and-surface-contract` and the
  release-certification requirements it introduced.
- Wisp returns to its product-owned dual-host, qualification, dashboard, and
  Codex canary contracts from ADRs 0002, 0004, 0005, 0006
  (`codex-e2e-testing`), and 0007.
- Wisp retains the capability-safe transcript and browser-failure persistence
  boundary discovered during the family wave because it enforces Wisp's
  existing dashboard-capability non-persistence rule, not shared release
  certification.
- A future Stewards integration may record where a marketplace was tested and
  may author a marketplace-install step into CI. Those facts do not define
  Wisp's SemVer, tags, release history, approval artifacts, validator runtime,
  behavioral support, or qualification.
- Wisp makes no support-state, package-version, tag, or implementation change
  under this decision.

### Open

- None.

### Parked

- None. The narrow Stewards metadata and CI-authoring design belongs to
  future Stewards work, not this reset.

## Context

The maintainer authorized a broad family rollout, and Wisp adopted it through
ADR-0006 and specifications 0001 v7-v8 and 0002 v3-v4. Implementation review
then showed that the shared contract required a universal release engine,
immutable validator runtimes, sandbox enforcement, approval resolution,
append-only cross-repository release history, and product-specific candidate
transactions.

That architecture did not deliver the intended first outcome: small metadata
describing tested marketplace surfaces plus a Stewards skill that adds the
appropriate marketplace setup step to CI. The maintainer therefore directed
the family to return to a state without the overarching release-certification
theme before designing that narrower capability.

The dashboard reliability fix in PR #38 is independent. It remains current.

## Decision

### 1. Restore Wisp's pre-wave product boundary

Wisp owns its existing manifest parity, bundled MCP behavior, dashboard,
qualification, and canary evidence. Wisp does not consume a shared family
release engine or common release-history protocol.

Specifications 0001 and 0002 advance to v9 and v5 respectively, restoring
their pre-family-wave behavioral contracts while retaining only the
independent capability-safe evidence clauses from v8/v4. The higher version
numbers preserve forward-only identity; they do not claim that the retired
family release/runtime behavior remains current.

### 2. Keep future marketplace integration narrow

Wisp may later declare factual marketplace-test observations using a narrow
Stewards-owned schema. Stewards may later provide a skill that edits CI to
install the required Claude and/or Codex marketplaces and plugins.

Those integration points shall not:

- choose or validate Wisp's package version or tag;
- maintain Wisp release history or approval artifacts;
- execute Wisp through a shared immutable runtime or sandbox;
- infer behavioral support from marketplace availability; or
- duplicate Wisp's product qualification.

### 3. Preserve independent current truth

This decision does not supersede:

- ADR-0006 `codex-e2e-testing`;
- ADR-0007 `codex-canary-evidence`;
- the dashboard lifecycle and health semantics; or
- PR #38's deterministic dashboard health fix.

## Consequences

- `adr-0006-family-plugin-release-and-surface-contract` becomes historical
  rather than current.
- The family-release additions to ADRs 0002 and 0004 are superseded; their
  original dual-host and session-bootstrap decisions remain current.
- Wisp avoids shipping or maintaining shared release-certification machinery.
- Capability-safe transcript and browser-failure persistence remains explicit
  product-local implementation debt; this reset neither implements it nor
  weakens it.

## Lifecycle record

The maintainer explicitly directed this reset on 2026-07-24. The independent
decision adversary returned `SOUND` after the product-local capability-safety
boundary was restored, and the independent conformance reviewer returned
`PASS`. Those acts promote this ADR from `gated` to `approved`.
- The later narrow Stewards work must prove only marketplace-test metadata and
  CI authoring, not universal release correctness.
