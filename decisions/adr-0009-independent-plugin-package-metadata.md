---
id: adr-0009-independent-plugin-package-metadata
type: adr
status: approved
depends_on:
  - adr-0002-plugin-mcp-distribution
  - adr-0004-codex-session-bootstrap
  - adr-0005-plugin-dashboard-lifecycle
  - adr-0006-codex-e2e-testing
  - adr-0007-codex-canary-evidence
  - adr-0008-retire-family-release-certification
  - stewards/kodhama-spec-0003-marketplace-test-observation@v1
owner: agent
updated: 2026-07-24
---

# ADR-0009 — Adopt independent plugin package metadata

## Decision state

### Decided

- Wisp owns an independent SemVer whose sole authority is
  `plugins/wisp/VERSION`.
- The first package under this rule is `0.2.1-rc.2`. The existing
  `0.2.1-rc.1` value and `wisp-test-v0.2.1-rc.1` tag make reuse unsafe, while
  stable `0.2.1` would overstate the still-pending qualification record.
- Both host manifests, the Codex cache segment, existing package/runtime
  carriers, qualification identity, and product surface metadata carry the
  same package version.
- Wisp adds lean product-owned surface metadata that points at existing
  qualification state and optional Stewards marketplace-test observations.
  It creates neither a support claim nor marketplace evidence.
- The package remains the existing dual-host Wisp implementation. This change
  adds metadata and advances candidate identity; it changes no MCP, dashboard,
  bus, or host-binding behavior.

The maintainer confirmed this exact rollout on 2026-07-24 after reviewing the
version choice, artifact/spec propagation, implementation carriers, tests,
and exclusions. This record still waits for the independent soundness gate.

### Open

- None.

### Parked

- Host-specific Stewards catalog admission, until an exact marketplace
  checkout has passed the applicable host-native smoke.
- Claude and cross-host qualification in issue #25.
- The optional CLI in issue #26.
- Windows process-identity qualification in issue #29.

## Context

ADR-0008 retired the over-broad family release-certification design while
explicitly preserving two narrow seams: Wisp may own product metadata, and
Stewards may define factual marketplace-test observations plus CI-step
authoring. Stewards has now approved the observation record as
`kodhama-spec-0003-marketplace-test-observation@v1`; it still does not own
Wisp's package identity, qualification, behavior, or release decisions.

Wisp already has one dual-host plugin and several copies of its candidate
version. Both manifests declare `0.2.1-rc.1`; Codex's bootstrap embeds that
version in its installed-cache path; the root package metadata, server
identity, qualification record, generated bundle, and tests carry or derive
the same value. No canonical product-local version file currently identifies
which copy is authoritative.

Reusing `0.2.1-rc.1` after changing the package would create a stale-cache
risk on Codex and contradict the existing test tag. Advancing directly to
stable `0.2.1` would imply a release posture the evidence does not support:
Node, Claude, Codex, dashboard, and overall qualification remain pending.
The next honest identity is therefore `0.2.1-rc.2`.

The plugin currently contains exactly eight paths. Adding the version
authority and surface metadata makes the product payload ten paths; existing
whole-payload tests and Codex staging must advance with that inventory rather
than silently omit the new files.

## Decision

### 1. One Wisp-local package version

`plugins/wisp/VERSION` is the sole Wisp plugin-package SemVer authority. It
contains exactly `0.2.1-rc.2` plus one terminal newline for this adoption.

The following carriers equal that value:

- `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json`;
- the Codex bootstrap's versioned cache segment;
- root `package.json` and both root-package entries in `package-lock.json`;
- the MCP server identity emitted from `src/mcp.ts`;
- `qualification.json.plugin_version`;
- the generated `dist/wisp.mjs` projection; and
- `surfaces.json.version`.

The generated bundle digest is recomputed after the source version changes,
and `qualification.json.artifact_sha256` follows it. Advancing the candidate
does not relabel old evidence: all qualification result fields remain
`pending` until their existing product-owned procedures produce fresh
evidence.

No Grove, Stewards, Trellis, or other product version is read, compared,
coordinated, or constrained.

### 2. Lean surface metadata points to qualification

`plugins/wisp/surfaces.json` is one closed product-owned JSON object:

```json
{
  "schema_version": 1,
  "version": "0.2.1-rc.2",
  "rows": [
    {
      "surface_id": "claude-interactive",
      "host": "claude",
      "qualification_path": "qualification.json",
      "qualification_key": "claude",
      "marketplace_test_observations": [],
      "disclosure": "Qualification is pending; Stewards catalog admission and marketplace registration for 0.2.1-rc.2 are not evidenced."
    },
    {
      "surface_id": "codex-cli-local-session",
      "host": "codex",
      "qualification_path": "qualification.json",
      "qualification_key": "codex",
      "marketplace_test_observations": [],
      "disclosure": "Qualification is pending; Stewards catalog admission and marketplace registration for 0.2.1-rc.2 are not evidenced."
    }
  ]
}
```

The top-level object and every row are closed. `version` equals `VERSION`;
row identifiers are unique and match
`^[a-z0-9][a-z0-9._/-]{0,127}$`; `host` is `claude` or `codex`;
`qualification_path` is the normalized plugin-relative
`qualification.json`; `qualification_key` selects the matching closed host
object; and `disclosure` is nonblank.

`marketplace_test_observations` is always an array. Any entry is a normalized
repository-relative JSON path with no `..` segment whose record structurally
satisfies
`stewards/kodhama-spec-0003-marketplace-test-observation@v1` and matches the
row's host and surface identifier. The initial arrays are empty.

The metadata exposes three facts without collapsing them:

- the package version identifies candidate bytes;
- `qualification.json` records Wisp behavior evidence; and
- a Stewards observation records only that one exact marketplace checkout was
  registered in one host run.

An empty observation array does not change qualification. An observation does
not prove behavior, support, release readiness, or catalog availability.

### 3. Existing payload and test contracts advance locally

The exact plugin payload becomes ten paths: the existing eight plus `VERSION`
and `surfaces.json`. Specification 0001 advances from v9 to v10 for that
inventory, version-carrier parity, and surface shape. Specification 0002
advances from v5 to v6 so deterministic Codex staging copies the same ten
paths and its dependency ledger points at the current contracts.

The existing product test suite remains the enforcement home. It derives
expected package identity from `VERSION`, checks strict SemVer and every
carrier, validates the closed surface/qualification/observation joins, and
keeps deterministic Codex E2E staging exhaustive. Wisp adds no shared family
validator, release runtime, or generated support projection.

### 4. Distribution and behavior stay separate

The plugin README stops claiming that Wisp is presently installable from the
Stewards marketplace. Catalog admission requires separate, host-specific
evidence and is not part of this decision.

This decision adds no:

- stable tag, release tag, GitHub Release, or release workflow;
- shared release history, approval record, generator, or validator runtime;
- synchronized family version or bump policy;
- Stewards catalog entry or marketplace observation;
- qualification promotion or support inference; or
- MCP, dashboard, bus, skill, or host-bootstrap behavior change.

The existing `wisp-test-v0.2.1-rc.1` test tag remains historical and is not
rewritten or promoted.

## Consequences

- Wisp gains one auditable package authority without importing Grove's richer
  release machinery or reviving ADR-0006's retired family contract.
- A package change must deliberately advance the Wisp-local SemVer and all
  current carriers; no automatic bump policy is introduced.
- Pending qualification remains visible rather than being converted into a
  support or release claim.
- Product and marketplace evidence can later be joined without either record
  impersonating the other.
- Adding two plugin files requires the current specifications, inventory
  tests, and Codex staging fixture to advance together.

## Rejected alternatives

### Reuse `0.2.1-rc.1`

Rejected because the value already identifies different cached bytes and a
remote test tag.

### Advance to stable `0.2.1`

Rejected because the checked-in qualification record is still pending.

### Restore ADR-0006's family release machinery

Rejected because ADR-0008 deliberately retired it and the narrow product
metadata plus Stewards observation seam does not require it.

### Derive support from marketplace presence

Rejected because availability and behavior are independently evidenced facts.

## Lifecycle record

Drafted after the maintainer confirmed the exact Wisp-local rollout on
2026-07-24. The author self-check found the package authority, pending
qualification, surface/evidence separation, downstream propagation, and
explicit exclusions internally consistent with ADR-0008 and the standing
product decisions, with no open intent item; that self-check moved the record
to `gated`. The independent decision adversary then returned `SOUND`, and the
changed-scope corpus review returned `PASS`. This `approved` status records
the maintainer's explicit confirmation of the exact rollout after those
choices were written back for review; it does not claim marketplace,
qualification, or release approval.
