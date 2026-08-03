---
id: adr-0019-receive-stewards-issue-taxonomy
type: adr
status: gated
depends_on: [kodhama/kodhama-0026-issue-taxonomy, stewards/kodhama-0022-propagate-collective-strategy]
owner: agent
updated: 2026-08-03
---

# adr-0019 — receive the Stewards issue taxonomy

## Context

Wisp owns a current Kodhama plugin, so the approved
[`kodhama-0026`](https://github.com/kodhama/kodhama/blob/main/decisions/0026-issue-taxonomy.md)
issue taxonomy applies here. This receipt follows the approved
[`kodhama-0022`](https://github.com/kodhama/stewards/blob/main/decisions/0022-propagate-collective-strategy.md)
propagation decision. Both remain authoritative at their homes; this record
copies neither.

**The two upstreams sit in different repositories.** `kodhama-0026` is an
org-layer record in `kodhama/kodhama`; `kodhama-0022` is a Stewards record
whose text names *"the approved Stewards decision"* as the authority a receipt
cites. `kodhama-0026` records that gap itself and rules it non-blocking —
*"the propagation section above names its targets either way."* This receipt
takes the same position.

## Decision

Wisp records receipt of the shared convention. This cross-link communicates the
upstream constraint without restating it: no dimension tables, no vocabularies,
no rationale, no README index. The vocabularies live in the plugin-carried
skill, and the org's issue types and seeded labels are what make them real.

`kodhama-0026` names no Wisp-specific obligation. The convention applies to how issues are filed here and to nothing else in the product.

## Consequences

The shared convention is discoverable in Wisp's local decision graph without
being copied or redefined.

**No local follow-up is required.** Wisp's six open issues were migrated to the convention on 2026-08-01. Observability behaviour, the MCP surface and the package are untouched.

This receipt authorizes no schema, behavior, setup, package, release,
distribution, validation, or support change, and makes no adoption-posture
choice — `kodhama-0022` holds that *"receipt is distinct from product
adoption."*

Written under `kodhama-0026` §Propagation, which names Grove, Trellis, Wisp
and Stewards as its cross-link targets. Status is `gated`: no maintainer
rollout direction has been given for these receipts, so approval is the
maintainer's act, not this record's.
