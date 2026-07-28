---
id: adr-0013-receive-stewards-availability-support-grammar
type: adr
status: approved
depends_on: [stewards/kodhama-0022-propagate-collective-strategy, stewards/kodhama-0023-separate-operational-availability-from-support]
owner: agent
updated: 2026-07-28
---

# ADR-0013 — Receive the Stewards availability/support grammar

> **Forward pointer.** `adr-0014-retire-preview-qualification-machinery`
> supersedes only this receipt's statement that current Wisp qualification
> metadata remains unchanged. Its constraint on every future exact-surface
> row remains current.
>
> **Forward pointer.** Stewards
> [`kodhama-0025`](https://github.com/kodhama/stewards/blob/main/decisions/0025-retire-the-surface-matrix.md)
> supersedes `kodhama-0023` in full, which retires exactly the remainder the
> pointer above preserved: no exact-surface row, `availability_state` or
> `support_claim` field is required of Wisp by any family contract. What this
> receipt records — that Wisp received the grammar on 2026-07-26 — still
> happened; what it forwards no longer binds.

## Decision state

### Decided

- Wisp records receipt of Stewards
  [`kodhama-0023`](https://github.com/kodhama/stewards/blob/main/decisions/0023-separate-operational-availability-from-support.md)
  under
  [`kodhama-0022`](https://github.com/kodhama/stewards/blob/main/decisions/0022-propagate-collective-strategy.md).
- Decision 0023 remains authoritative for the shared grammar.
- Future Wisp exact-surface metadata must use that common grammar.
- This receipt authorizes no product or implementation change.

### Open

- None.

### Parked

- Any migration of Wisp's surface metadata.
- Any change to Wisp's qualification model or current absence of a
  project-setup operation.
- Package, release, support, documentation, specification, and implementation
  changes; each requires separate Wisp authority.

## Local applicability

The shared grammar constrains future Wisp exact-surface metadata. This ADR
records only that constraint in Wisp's local decision graph.

Wisp's current qualification metadata and absence of a project-setup operation
remain unchanged. Any schema migration or product behavior change is separate
work.

## Self-check

Both upstream decisions are approved and linked through Wisp's registered
`stewards/` prefix. The shared grammar is not copied or redefined; local
applicability and separate follow-up work are explicit.

## Lifecycle record

The maintainer ratified Stewards decision 0023 and authorized rollout of its
thin receipts on 2026-07-26. An independent decision adversary returned
`SOUND` for exact commit `46c4cae`. Under that explicit rollout authorization,
`approved` records the receipt after its required gate passed.
