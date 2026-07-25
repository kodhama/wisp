---
id: adr-0011-node-24-only-support
type: adr
status: approved
depends_on:
  - adr-0002-plugin-mcp-distribution
  - adr-0006-codex-e2e-testing
  - adr-0009-independent-plugin-package-metadata
owner: human
updated: 2026-07-25
---

# ADR-0011 — Support Node.js 24 only

## Decision state

### Decided

- Wisp supports and qualifies only Node.js 24.x.
- Pull-request compatibility testing runs once on Node.js 24 rather than
  maintaining a multi-version Node matrix.
- The distributed bundle targets Node.js 24.
- The changed candidate advances from `0.2.1-rc.2` to `0.2.1-rc.3` under
  Wisp's existing independent package-version contract.

The maintainer selected this exact direction on 2026-07-25: “Agreed. But
change the compat matrix to node 24. We don't need to be so broad.”

### Open

- None.

### Parked

- Supporting another Node.js line if a concrete consumer need appears.

## Context

ADR-0002 and ADR-0006 established support and pull-request testing across
Node.js 20, 22, and 24. That breadth was useful while Wisp's runtime floor was
unsettled, but it is now an unnecessary product promise.

Node.js 20 reached end of life on 2026-03-24. Node.js 22 and 24 remain
maintained, but Wisp has no identified consumer requirement for a two-LTS
compatibility window. Wisp is a host-launched plugin rather than a general
npm library, and both current host adapters may use the host-provided Node.js
runtime. Carrying extra runtime lines expands qualification state, CI work,
and failure handling without evidence that users need that breadth.

The plugin payload changes when its bundle target and qualification schema
change. ADR-0009 therefore requires a new independent Wisp candidate identity
rather than reusing `0.2.1-rc.2`.

## Decision

Wisp SHALL support exactly the latest available patch of Node.js 24.x for the
current package line. “Node.js support” in Wisp means that the exact
distributed bundle builds and launches in a clean fixture on that line and
that `qualification.json` contains exactly one `node_versions` entry, keyed
`"24"`, with its exact runtime version and result.

The fast pull-request job SHALL run typecheck, unit tests, bundle build, and
plugin validation once on Node.js 24. It SHALL NOT retain a one-element matrix
abstraction. The independent browser E2E job and real-host canary remain
unchanged and continue to use their existing explicit Node.js 24 setup.

The bundle build target SHALL be `node24`. That esbuild setting controls the
JavaScript syntax and runtime features the generated artifact preserves for
compatibility; leaving it at `node20` would make the build retain a lower
compatibility floor that Wisp no longer tests or claims. Repository tests
SHALL reject Node.js 20 or 22 qualification keys, CI entries, and
bundle-target claims.

The package candidate SHALL advance to `0.2.1-rc.3`. All carriers governed by
ADR-0009 SHALL advance together, and the generated bundle digest and pending
qualification identity SHALL be recomputed without promoting any host,
dashboard, marketplace, or overall qualification result.

This decision supersedes only:

- ADR-0002's Node.js 20/22/24 qualification policy;
- ADR-0006's three-version fast-test matrix; and
- ADR-0009's initial `0.2.1-rc.2` candidate value.

All other distribution, testing, package-authority, surface-metadata, and
qualification semantics remain current.

## Consequences

- CI and release qualification have one supported Node.js runtime.
- Node.js 20 and 22 compatibility are no longer tested or claimed.
- Consumers needing another runtime line must bring a concrete requirement
  and re-open the support decision.
- Changing the bundle target and payload advances the candidate version even
  though Wisp's MCP, dashboard, bus, and host behavior do not change.

## Rejected alternatives

### Keep Node.js 20, 22, and 24

Rejected because Node.js 20 is end-of-life and no consumer requirement
justifies maintaining three runtime lines.

### Support Node.js 22 and 24

Rejected because Wisp has no evidence that a two-LTS window is needed. It
would preserve most of the matrix and qualification breadth the maintainer
explicitly chose to remove.

### Test only Node.js 24 but keep a Node.js 20 bundle target

Rejected because the build would continue preserving an untested Node.js 20
syntax/runtime compatibility floor even though Wisp no longer supports that
runtime.

## Acceptance criteria

- The current specs name only Node.js 24 as a supported runtime.
- CI runs the fast repository gate exactly once on Node.js 24.
- The fast repository gate has no version-matrix strategy.
- The bundle target is `node24`.
- Qualification metadata contains exactly the Node.js 24 key.
- Every package-version carrier equals `0.2.1-rc.3`, and the recorded bundle
  digest matches the generated artifact.
- Existing host, dashboard, marketplace, and overall qualification results
  remain pending.

## Open questions

- None.
