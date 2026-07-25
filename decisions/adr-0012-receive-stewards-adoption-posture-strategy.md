---
id: adr-0012-receive-stewards-adoption-posture-strategy
type: adr
status: gated
depends_on: [stewards/kodhama-0021-separate-adoption-posture-from-support, stewards/kodhama-0022-propagate-collective-strategy]
owner: agent
updated: 2026-07-25
---

# ADR-0012 — Receive the Stewards adoption-posture strategy

## Decision state

### Decided

- Wisp records receipt of Stewards
  [`kodhama-0021`](https://github.com/kodhama/stewards/blob/main/decisions/0021-separate-adoption-posture-from-support.md)
  under
  [`kodhama-0022`](https://github.com/kodhama/stewards/blob/main/decisions/0022-propagate-collective-strategy.md).
- Decision 0021 remains authoritative for the shared strategy.
- The strategy applies because Wisp owns a current dual-host Kodhama plugin.
- This receipt authorizes no product or implementation change.

### Open

- None.

### Parked

- Any Wisp adoption-posture or catalog choice.
- Package, release, qualification, support, documentation, and implementation
  changes; each requires separate Wisp authority.

## Local applicability

The shared strategy applies to Wisp plugin distribution and support language.
This ADR records only that the strategy is visible in Wisp's local decision
graph.

No follow-up is required by this receipt itself. It selects no adoption
posture, changes no existing Wisp decision or specification, and makes no
catalog, qualification, release, or support claim.

## Self-check

Both upstream decisions are approved and linked through Wisp's registered
`stewards/` prefix. Shared strategy is not copied or redefined; local
applicability and follow-up are explicit.

## Lifecycle record

The maintainer authorized the cross-link rollout on 2026-07-25. This artifact
is self-checked and `gated` for independent soundness review; exact
ratification remains a later human intent act.
