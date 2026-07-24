---
id: adr-0010-preserve-marketplace-observation-provenance
type: adr
status: gated
depends_on:
  - adr-0009-independent-plugin-package-metadata
  - stewards/kodhama-spec-0003-marketplace-test-observation@v1
owner: agent
updated: 2026-07-24
---

# ADR-0010 — Preserve marketplace-observation provenance

## Decision state

### Decided

- Structural validation of a retained Stewards observation proves only that
  its closed fields are well formed and internally consistent.
- Wisp may call the observation authenticated marketplace-registration
  evidence only when its runtime provenance has been established by the
  Stewards procedure or presently re-authenticated against the named run.
- When that provenance cannot presently be authenticated, Wisp reports it as
  `unverified`; it does not turn structural validity into a registration pass
  or failure.
- This amendment changes only ADR-0009's observation semantics. Its package
  version, ten-path inventory, qualification separation, initial empty
  observation arrays, and all behavior/release exclusions remain unchanged.

### Open

- None.

### Parked

- The host-specific observation-producing CI runs remain part of later
  marketplace admission, as parked by ADR-0009.

## Context

ADR-0009 adopted
`stewards/kodhama-spec-0003-marketplace-test-observation@v1`, but its wording
collapsed two boundaries that the approved external contract keeps separate.
It required referenced observations to pass offline structural validation,
then described a referenced record as evidence that a marketplace checkout
was registered in a host run.

The Stewards contract says structural validation does not query GitHub or
authenticate a run. Runtime provenance is established by the setup step that
verifies the checkout, revision, host registration, host listing, and GitHub
Actions identifiers. If that external provenance later cannot be
re-authenticated, a consumer must say `unverified` rather than infer success.

This is an upstream defect in ADR-0009, not a discretion that its downstream
specification should resolve. Wisp's package-metadata rollout has not yet
implemented or retained any observation, so the correction can land without
migrating data or changing product behavior.

## Decision

ADR-0009 §2 is amended as follows.

`marketplace_test_observations` remains an array of normalized
repository-relative JSON paths. Offline package validation still rejects an
absent array, an escaping or malformed path, an observation with an invalid
closed shape, or a host/surface mismatch.

Passing those checks establishes only **structural validity**. It does not
authenticate the named GitHub Actions run and does not prove marketplace
registration.

Wisp treats runtime provenance as a separate state:

1. `verified` means the record was emitted by the Stewards-defined setup step
   after its runtime checks succeeded, or its named run and retained artifact
   have presently been authenticated with equivalent evidence;
2. `unverified` means the record is structurally valid but its external run
   provenance is unavailable or cannot presently be authenticated; and
3. structurally invalid input is rejected rather than assigned either
   provenance state.

Whenever Wisp reports or projects a referenced observation without presently
authenticated provenance, it says `unverified`. It shall not describe that
record as registration evidence, and it shall not convert the state into a
pass or failure.

Even verified provenance proves only that one exact marketplace checkout was
registered by one host run. It still does not identify an installed plugin or
prove plugin behavior, qualification, support, release readiness, or current
catalog availability.

The pending SPEC-0001 v10 amendment shall encode this distinction in its
surface contract, acceptance criteria, requirements, and verification
matrix. Static tests shall exercise structural rejection and the
structurally-valid-but-unverified state without requiring network access.

## Consequences

- Wisp remains faithful to the approved Stewards observation contract instead
  of upgrading offline shape validation into an authenticated runtime fact.
- Product metadata can retain observation links while honestly reporting
  temporary loss of external provenance.
- No new surface field, network dependency, support state, or release
  machinery is introduced.
- ADR-0009 remains approved and otherwise current; its forward pointer directs
  readers to this partial amendment.

## Lifecycle record

The contract author drafted this narrow repair after the conformance review
of pending SPEC-0001 v10 returned `UPSTREAM-INDICTED`. The self-check found
the structural/runtime boundary, unverified state, downstream propagation,
and no-behavior-change limit explicit and testable, with no remaining open
intent item; it moved the record to `gated`. Human intent ratification and
independent decision/corpus review remain owed.
