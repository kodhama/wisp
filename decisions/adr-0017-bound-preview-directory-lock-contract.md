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

# ADR-0017 — Bound the Preview project-bus lock contract

> **Forward pointer.** `adr-0018-retire-the-marketplace-canary` supersedes
> the clauses requiring PR #49 to retain its canary repairs — their carrier
> is deleted. The bounded Preview directory-lock contract this ADR owns is
> unchanged, as is the lineage it inherits from `adr-0015` and `adr-0016`.

## Decision state

### Decided

- Wisp Preview makes no guarantee about the current project-bus
  `.wisp/write.lock` mutual-exclusion and append-ordering protocol's
  concurrency, ownership, recovery, cleanup, path identity, deadlines,
  timing, error mapping, or diagnostics.
- The boundary applies to concurrent processes and same-process operations.
- An append commit means only that one complete event plus its terminating LF
  was written; it does not guarantee later preservation or durability when
  bus operations overlap through that protocol.
- Event schema, validation, exact serialization, project confinement, and
  per-operation byte accounting remain contracted.
- No aggregate bus-size guarantee applies across concurrent operations.
- The separate user-runtime dashboard ownership/coordinator contract under
  ADR-0005 remains current and is outside this boundary.
- Issue #50 solely owns project-bus lock correctness and redesign.
- ADR-0017 adds no further runtime lock change. PR #49 does not redesign the
  project-bus lock or claim its correctness, while retaining its already
  present bounded runtime, owner-validation, append, and canary repairs.

The maintainer explicitly selected this direction in-session on 2026-07-26.

### Open

- None for PR #49.

### Parked

- Every positive project-bus lock-correctness, protocol, migration, and
  implementation decision remains in issue #50.

## Context

ADR-0016 documented current project-bus lock internals while disclaiming
demonstrated races. Repeated conformance repair showed that this still made
incidental timing, path, cleanup, recovery, and diagnostic mechanics part of
the product contract. Preview does not warrant those internals.

## Decision

SPEC-0001 SHALL state only the negative lock boundary above. It SHALL NOT make
current project-bus `.wisp/write.lock` mutual-exclusion or append-ordering
mechanics, owner records, process-identity use, recovery rules, cleanup
behavior, path mutation, retry timing, deadlines, errors, or diagnostics
normative. This negative boundary SHALL NOT weaken or disclaim ADR-0005's
separate user-runtime dashboard ownership/coordinator contract.

The full event-plus-LF write remains the per-operation append commit point.
That point says what this operation completed; it does not promise that
overlapping or later lock activity will preserve or durably retain those
bytes. Exact serialization and byte accounting remain per-operation
guarantees, not a concurrent aggregate-size guarantee.

Issue #50 is the sole venue for research, decision, implementation, migration,
and correctness claims for a replacement project-bus lock. ADR-0017 SHALL add
no further runtime lock change. PR #49 SHALL NOT redesign the project-bus lock
or claim its correctness; its already present bounded runtime,
owner-validation, append, and canary repairs remain in scope.

## Supersession

This decision supersedes ADR-0016's positive project-bus lock-internal
contract in full. ADR-0016 remains provenance for why PR #49 did not redesign
the project-bus lock.

This decision broadens ADR-0014's partial supersession: ADR-0014's retained
runtime-safety, exact-write, cleanup/recovery, and process-identity language
does not create a project-bus `.wisp/write.lock` mutual-exclusion or
append-ordering guarantee. ADR-0014's qualification retirement, Preview
posture, distribution, dashboard, security, and other unrelated guarantees
remain current. In particular, ADR-0005's separate user-runtime dashboard
ownership/coordinator contract is unaffected.

## Consequences

- SPEC-0001 no longer freezes inherited project-bus lock implementation
  details.
- Characterization tests may observe current behavior but do not create a
  Preview guarantee.
- Users must not infer project-bus mutual exclusion, append ordering,
  ownership continuity, recovery safety, cleanup safety, diagnostic behavior,
  later byte preservation, durability, or a concurrent aggregate size bound
  from the current project-bus lock.

## Acceptance criteria

- SPEC-0001 contains the minimal negative boundary and none of the superseded
  positive project-bus lock-internal requirements.
- The boundary names `.wisp/write.lock` mutual exclusion and append ordering
  and explicitly preserves ADR-0005's separate user-runtime dashboard
  ownership/coordinator contract.
- Retained schema, validation, serialization, confinement, and per-operation
  byte-accounting requirements remain testable.
- Append commit is defined only as completion of the full event-plus-LF write.
- Concurrent aggregate size and later preservation/durability are not
  guaranteed.
- Issue #50 is the sole project-bus lock-correctness venue; ADR-0017 adds no
  further runtime lock change; and PR #49 retains its already present bounded
  runtime, owner-validation, append, and canary repairs without redesigning
  the project-bus lock or claiming its correctness.

## Self-check

- **Intent fidelity:** the contract removes project-bus lock promises rather
  than selecting a different implementation.
- **Scope:** unrelated product guarantees remain current.
- **Testability:** structural checks can reject positive project-bus lock
  requirements, while retained data and dashboard guarantees keep their
  executable evidence.

## Lifecycle record

The maintainer's explicit in-session selection is the human intent act;
`approved` records that ratification. A targeted decision-adversary repair
then scoped the boundary to the project-bus `.wisp/write.lock` protocol,
preserved ADR-0005's separate dashboard contract, and distinguished “no
redesign or correctness claim” from PR #49's retained bounded repairs without
changing the ratified direction. The targeted re-review returned `SOUND`
([durable PR record](https://github.com/kodhama/wisp/pull/49#issuecomment-5083016108)).
