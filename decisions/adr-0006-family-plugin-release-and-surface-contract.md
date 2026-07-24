---
id: adr-0006-family-plugin-release-and-surface-contract
type: adr
status: superseded
depends_on:
  - adr-0002-plugin-mcp-distribution
  - adr-0004-codex-session-bootstrap
  - adr-0005-plugin-dashboard-lifecycle
  - stewards/kodhama-0015-family-plugin-release-and-surface-contract
  - stewards/kodhama-0016-distribution-availability-and-effective-support
owner: agent
updated: 2026-07-24
---

# ADR-0006 — Adopt the family plugin release and surface contract

> **Superseded by `adr-0008-retire-family-release-certification`.**

## Decision state

### Decided

- Wisp adopts the family plugin release and surface contract established by
  Stewards decisions `kodhama-0015` and `kodhama-0016`.
- Root `package.json` is Wisp's one canonical plugin SemVer authority.
- Both host manifests, the Codex cache bootstrap, the bundled MCP server
  identity, the qualification record, and the product surface contract are
  derived carriers of that authority and must agree with it.
- Wisp owns a version-bound, exact-surface contract at
  `plugins/wisp/surfaces.json`; Stewards owns catalog and provisioner
  availability separately.
- A Wisp release is tagged `wisp-v<version>` only after Wisp's existing
  dual-host and dashboard qualification contract passes for that version.
- Catalog availability is not behavioral support. A Wisp catalog entry may be
  published or distribution-verified without making Wisp effectively
  supported on a surface.

### Open

- None.

### Parked

- None. GitHub Release objects and automated release notes remain outside the
  family contract and are not needed to adopt it.

## Context

ADR-0002 makes Wisp one self-contained dual-host plugin and requires the two
host manifests to carry the same SemVer. ADR-0004 additionally binds the
Codex manifest's inline cache path to that manifest version. ADR-0005 extends
the same package with the dashboard and keeps release eligibility contingent
on independent Claude, Codex, and cross-host dashboard qualification.

The repository currently repeats `0.2.0` in root `package.json`, both host
manifests, the inline Codex cache bootstrap, the MCP server identity, static
tests, and `qualification.json`. Tests compare several of those copies, but no
record declares which value is authoritative or prevents a release process
from updating the wrong copy first.

The current qualification record is deliberately incomplete:

- its Claude result is `pending`;
- its Codex result is `pass`;
- its dashboard result is `pending`; and
- its overall result is `pending`.

Those are version-bound product facts. A Codex pass is no evidence for Claude,
and a host-level result does not by itself identify every exact Codex surface.
The pending record therefore cannot authorize a release tag or a Claude
support row.

Stewards decision `kodhama-0015` supplies the family release shape: one
product-owned SemVer authority, derived carrier parity, an immutable
`<plugin>-v<version>` tag, and a version-bound product surface contract.
Stewards decision `kodhama-0016` keeps marketplace/provisioner availability
separate and defines effective support as a conjunction of matching product,
distribution, consumer, environment, and setup facts. Both decisions are
merged and `approved`.

## Decision

### 1. Root `package.json` is the sole package-version authority

`package.json` at the repository root owns Wisp's plugin release version. A
release change edits that value once. Every other package-version occurrence
is generated from it or validated as a derivative:

- `plugins/wisp/.claude-plugin/plugin.json` → `version`;
- `plugins/wisp/.codex-plugin/plugin.json` → `version`;
- root `package-lock.json` → `version`;
- `package-lock.json` → `packages[""].version`;
- the version segment in the Codex inline bootstrap cache path;
- the bundled MCP server's host-visible implementation version;
- `plugins/wisp/qualification.json` → `plugin_version`; and
- `plugins/wisp/surfaces.json` → `version`.

Tests may contain expected values only when they read the authority and derive
their expectation; a literal release number in a test is not another
authority. Release validation fails on any mismatch.

A version bump does not relabel old qualification evidence. Preparing a new
candidate binds `qualification.json.plugin_version` to the package version
and `artifact_sha256` to the SHA-256 of that candidate's exact
`dist/wisp.mjs`, preserving the standing qualification meaning. Unless fresh
evidence for that exact candidate is recorded in the same operation,
preparation resets every
version-bound result and evidence field:

- every `node_versions[*].result` becomes `pending`; the Node version remains
  only the target runtime descriptor;
- Claude and Codex `result` values become `pending`, and every host proof
  boolean becomes `false`; host version values remain target descriptors;
- dashboard `result` becomes `pending` and every `*_passed` evidence boolean
  becomes `false`; the declarative `explicit_start_only` contract value is
  preserved;
- the top-level overall `result` becomes `pending`; and
- `date`, `platform`, and `architecture` retain their existing schema-valid
  concrete values during candidate reset solely because the standing schema
  has no pending sentinel for them. With all results pending they are
  non-evidentiary descriptors. The first fresh qualification run atomically
  replaces all three with that run's real date, `process.platform`, and
  `process.arch`.

Evidence for an earlier version remains historical evidence in version
control and cannot pass the new release. No Node, host, dashboard, artifact,
or overall pass survives merely because its input name still exists.

### 2. Wisp owns an exact-surface contract

Wisp shall add `plugins/wisp/surfaces.json`, conforming to the family schema
and canonical surface registry. Its top-level `version` equals
`package.json.version`. Each row names one canonical `surface_id`, host,
release state, load/use path, evidence, and the state-specific support record
or missing-capability disclosure required by the family contract.

Only a `supported` row is a Wisp behavioral promise. Rows may be `candidate`
or `unsupported`, and an absent row is no claim. Wisp may add declared
product fields that bind a row to its MCP project-resolution, dashboard, or
qualification evidence; those product facts do not enter the family
vocabulary.

The first matrix must preserve the current evidence boundary:

- no Claude surface is `supported` while
  `qualification.json.claude.result` remains `pending`;
- the current Codex `pass` may support only an exact canonical surface after
  its retained evidence is mapped to that surface and satisfies the common
  support-record contract; it does not flow to other Codex surfaces; and
- the pending dashboard and overall results remain visible and cannot be
  rewritten as product support.

Public Wisp support documentation derives from, or is byte-checked against,
this file. Stewards never promotes a Wisp row or manufactures its evidence.

### 3. Qualification remains Wisp's release gate

The package is releasable only when all standing Wisp qualification
obligations and the new family release checks pass together:

1. `package.json.version` is valid SemVer and every declared carrier matches;
2. both host manifests validate and launch the same bundled candidate;
3. the Node, Claude, Codex, dashboard, and overall qualification results meet
   ADR-0002 and ADR-0005's existing `pass` contract for this exact version;
4. the Codex cache bootstrap resolves the version-matched installed bundle as
   required by ADR-0004;
5. `surfaces.json` validates, uses only canonical ids, and binds any
   `supported` row to exact-surface evidence; and
6. generated support documentation is current.

The current `0.2.0` tree is therefore a candidate, not a conforming family
release: its checked-in qualification result is `pending`.

After the human-owned Wisp release gate accepts a candidate, deterministic
automation creates `wisp-v<version>` at that exact commit. The tag is
immutable. Re-running at the same commit is a no-op; finding the same tag at a
different commit is a hard failure. No tag is created merely because a
version value changed on a branch or reached `main`.

### 4. Distribution availability remains independent

Stewards may publish or verify a Wisp catalog/provisioner route according to
its own availability contract. Wisp's release record supplies the package
version, tag, source commit, product contract path, and product evidence that
Stewards may reference; Wisp does not own the catalog state.

A catalog entry is never a Wisp support row. It may remain visible for
discovery or staged testing while one or more product surfaces are
unsupported, candidate, or absent. Effective support remains false unless
the exact Wisp release has a matching `supported` row and every independent
Stewards, consumer, environment, and setup prerequisite also holds.

This decision does not claim that Wisp is currently listed in either Stewards
catalog and does not require catalog publication before product
qualification.

## Consequences

- The implementation shall project one version value instead of maintaining
  release literals independently across package files, bootstrap code,
  qualification data, server identity, and tests.
- The implementation shall add the product surface contract, release
  validator, generated support view, and deterministic tag materializer.
- Wisp's existing qualification contract becomes stricter only by binding its
  evidence and surface claims to the canonical package version; its current
  requirement for Claude, Codex, and dashboard success is not weakened.
- No current pending result is promoted, and no `wisp-v0.2.0` tag is owed
  until the complete `0.2.0` candidate passes the release gate.
- Stewards can progress catalog and provisioner work independently, but no
  distribution state can substitute for a Wisp behavioral record.

## Rejected alternatives

### Add a second `VERSION` file

Rejected because `package.json` is already required by Wisp's build and
contains a valid SemVer authority. A second hand-owned value would create the
drift this decision removes.

### Keep manually synchronized version literals

Rejected because equality tests detect only known copies and make every
release edit several authorities by convention. Derivation from one declared
authority makes new carriers visible and reviewable.

### Treat the Codex pass as cross-surface or cross-host support

Rejected because the retained result is host-scoped, Claude and dashboard
remain pending, and the family contract forbids evidence from flowing between
exact surfaces.

### Tag the current package before qualification completes

Rejected because it would publish an immutable release identity for a
candidate that Wisp's own approved ADRs still declare unreleasable.

### Use catalog publication as the release or support gate

Rejected because Stewards availability and Wisp behavior have different
owners and evidence. Coupling them would erase the effective-support
conjunction established by `kodhama-0016`.

## Acceptance criteria

- **AC1:** One edit to `package.json.version` deterministically updates or
  invalidates every declared package-version carrier; release validation
  rejects any mismatch.
- **AC2:** A version change cannot retain a previous version's qualification
  pass. New candidate evidence begins pending unless fresh, exact-candidate
  results are recorded.
- **AC3:** `plugins/wisp/surfaces.json` matches the canonical package version,
  accepts Wisp-specific extensions, and makes no supported claim from the
  current pending Claude or dashboard results.
- **AC4:** A Codex support row, if any, is bounded to the exact surface proven
  by its retained record and implies no other Codex, Claude, cloud, CI, SDK,
  desktop, or IDE surface.
- **AC5:** No `wisp-v<version>` tag is created until both the existing Wisp
  qualification contract and the family release validation pass; a tag
  conflict never moves an existing tag.
- **AC6:** Catalog publication and provisioner availability can be represented
  without creating a Wisp support or effective-support claim.
- **AC7:** ADR-0002's dual-host package, ADR-0004's session-safe Codex
  bootstrap, and ADR-0005's explicit dashboard lifecycle remain intact.

## Self-check

- **Settled inputs:** local ADRs 0002, 0004, and 0005 and Stewards decisions
  0015 and 0016 are `approved`. Draft ADR-0001 is not consumed.
- **Source fidelity:** the declared authority and carrier list match the
  current repository: root `package.json`, both manifests, the Codex cache
  literal, MCP server identity, and `qualification.json`. The current
  qualification states are quoted without promotion.
- **Ownership:** Wisp retains releases, behavior, qualification, setup, and
  product evidence. Stewards retains catalogs, provisioners, and distribution
  evidence. Effective support is not duplicated locally.
- **Compatibility:** the decision adds derivation, tagging, and
  exact-surface records without weakening the approved dual-host,
  project-binding, or dashboard contracts.
- **Testability:** AC1–AC7 are mechanical or evidence-backed release checks.
  No current host or surface support is inferred.

## Approval record

On 2026-07-24 the maintainer authorized the family-wide rollout, including
per-product decisions that preserve each plugin's existing contracts, and
authorized merge after independent review. The decision-adversary returned
SOUND after the qualification, digest, metadata-reset, carrier, and
forward-pointer findings were resolved. This `approved` status records that
prior human intent act; it does not promote Wisp's pending host qualification
or authorize a release tag.
