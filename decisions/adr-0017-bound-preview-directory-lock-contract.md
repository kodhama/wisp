---
id: adr-0017-bound-preview-directory-lock-contract
type: adr
status: approved
depends_on:
  - adr-0014-retire-preview-qualification-machinery
owner: human
updated: 2026-07-26
changes:
  - spec-0001-plugin-mcp-distribution@v15
  - spec-0002-codex-e2e-testing@v8
---

# ADR-0017 — Bound the Preview directory-lock contract

## Decision state

### Decided

- Wisp Preview makes no guarantee about the current directory-lock
  implementation's concurrency, ownership, recovery, cleanup, path identity,
  deadlines, or diagnostics.
- The boundary applies to concurrent processes and same-process operations.
- An append commit means only that one complete event plus its terminating LF
  was written; it does not guarantee later preservation or durability under
  overlap.
- Event schema, validation, exact serialization, project confinement, and
  per-operation byte accounting remain contracted.
- No aggregate bus-size guarantee applies across concurrent operations.
- Issue #50 solely owns directory-lock correctness and redesign.
- PR #49 makes no runtime lock change.

The maintainer explicitly selected this direction in-session on 2026-07-26.

### Open

- None for PR #49.

### Parked

- Every positive lock-correctness, protocol, migration, and implementation
  decision remains in issue #50.

## Context

ADR-0016 documented current lock internals while disclaiming demonstrated
races. Repeated conformance repair showed that this still made incidental
timing, path, cleanup, recovery, and diagnostic mechanics part of the product
contract. Preview does not warrant those internals.

## Decision

SPEC-0001 SHALL state only the negative lock boundary above. It SHALL NOT make
current lock mechanics, owner records, process-identity use, recovery rules,
cleanup behavior, path mutation, retry timing, deadlines, or diagnostics
normative.

The full event-plus-LF write remains the per-operation append commit point.
That point says what this operation completed; it does not promise that
overlapping or later lock activity will preserve or durably retain those
bytes. Exact serialization and byte accounting remain per-operation
guarantees, not a concurrent aggregate-size guarantee.

Issue #50 is the sole venue for research, decision, implementation, migration,
and correctness claims for a replacement lock. PR #49 SHALL make no runtime
lock change.

## Supersession

This decision supersedes ADR-0016's positive lock-internal contract in full.
ADR-0016 remains provenance for why PR #49 did not redesign the lock.

This decision broadens ADR-0014's partial supersession: ADR-0014's retained
runtime-safety, exact-write, cleanup/recovery, and process-identity language
does not create a directory-lock guarantee. ADR-0014's qualification
retirement, Preview posture, distribution, dashboard, security, and other
unrelated guarantees remain current.

## Consequences

- SPEC-0001 no longer freezes inherited lock implementation details.
- Characterization tests may observe current behavior but do not create a
  Preview guarantee.
- Users must not infer serialization, ownership continuity, recovery safety,
  cleanup safety, diagnostic behavior, later byte preservation, durability,
  or a concurrent aggregate size bound from the current lock.

## Acceptance criteria

- SPEC-0001 contains the minimal negative boundary and none of the superseded
  positive lock-internal requirements.
- Retained schema, validation, serialization, confinement, and per-operation
  byte-accounting requirements remain testable.
- Append commit is defined only as completion of the full event-plus-LF write.
- Concurrent aggregate size and later preservation/durability are not
  guaranteed.
- Issue #50 is the sole lock-correctness venue and PR #49 changes no runtime
  lock behavior.

## Self-check

- **Intent fidelity:** the contract removes lock promises rather than
  selecting a different implementation.
- **Scope:** unrelated product guarantees remain current.
- **Testability:** structural checks can reject positive lock requirements,
  while retained data guarantees keep their executable evidence.

## Lifecycle record

The maintainer's explicit in-session selection is the human intent act;
`approved` records that ratification.
