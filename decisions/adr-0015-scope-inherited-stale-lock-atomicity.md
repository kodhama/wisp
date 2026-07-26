---
id: adr-0015-scope-inherited-stale-lock-atomicity
type: adr
status: approved
depends_on:
  - adr-0002-plugin-mcp-distribution
  - adr-0014-retire-preview-qualification-machinery
owner: human
updated: 2026-07-26
changes:
  - spec-0001-plugin-mcp-distribution@v13
---

# ADR-0015 — Scope inherited stale-lock atomicity out of qualification retirement

## Decision state

### Decided

- PR #49 remains a qualification-retirement change and does not expand into a
  replacement of Wisp's cross-process write-lock subsystem.
- The existing final-reread-to-pathname-rename race is recorded as a Preview
  limitation, not represented as an atomic current-lock guarantee.
- The crash-safe write-lock redesign is tracked by issue #50 and requires its
  own research and ADR before implementation.
- The independently reproduced final-line callback cleanup defect remains in
  PR #49 because it is a bounded correctness repair in the changed Codex
  canary.

The maintainer selected this scope in-session on 2026-07-26 after the
implementation review demonstrated the portability boundary.

### Open

- None for PR #49.

### Parked

- Selection of the replacement lock primitive. Node 24's built-in
  `node:sqlite` transaction locking is the first candidate to evaluate, not a
  decision made by this ADR.
- Implementation, migration, and compatibility details for the crash-safe
  lock redesign.

## Context

Wisp currently serializes project-bus appends with a directory at
`.wisp/write.lock`. Stale recovery reads and classifies `owner.json`, rereads
it for equality, and then renames the lock directory by pathname.

Review of PR #49 reproduced a race after that final reread. A second recoverer
can retire the directory that was inspected, a new writer can acquire and
publish a replacement at the canonical pathname, and the first recoverer can
then rename and delete the replacement. That can remove a live owner's lock
and permit concurrent appenders.

The same reread-then-pathname-rename structure exists on `main`; PR #49 did
not introduce it. The review nevertheless correctly exposed that
SPEC-0001's absolute statement that every race leaves the current lock
untouched is stronger than portable dependency-free Node 24 filesystem APIs
can implement.

Node 24 exposes neither an inode-conditional directory rename nor the
`openat`/`renameat2`/`flock` primitives needed to make the inspected directory
and the renamed directory one atomic identity operation. Another pathname
reread narrows but does not close the gap. A cooperative claim built from the
same crash-persistent pathname primitives recursively needs safe stale-claim
recovery.

## Decision

### Keep qualification retirement scoped

PR #49 SHALL retire aggregate qualification machinery, preserve Preview
distribution, and retain its bounded canary and owner-validation correctness
repairs. It SHALL NOT add a native addon, daemon, CLI, package-manager install
step, SQLite lock, or new runtime lock protocol.

The PR SHALL link issue #50 from its propagation record and identify the
stale-lock race as inherited and parked. Landing this PR does not assert that
the current pathname recovery is safe against replacement in the final gap.

### State the current contract honestly

SPEC-0001 SHALL stop requiring the current directory-lock implementation to
provide inode-conditional final retirement. It SHALL preserve the checks the
implementation actually provides:

- exact valid-owner equality on the final reread;
- byte-for-byte equality for readable malformed owners;
- missing-to-missing equality for ownerless recovery;
- fail-closed behavior for every mismatch observed before rename; and
- atomic pathname quarantine of whichever directory occupies the canonical
  path when the rename executes.

Those checks are useful defenses but SHALL NOT be described as proving that
the renamed directory is still the inode that supplied the reread snapshot.
The known final-gap race remains a Preview limitation until issue #50 lands.

### Redesign separately

Issue #50 SHALL shape a crash-safe, process-crash-releasing serialization
primitive while preserving the canonical NDJSON bus and its irreversible
event-plus-LF append commit point.

The redesign SHALL compare Node 24 built-in `node:sqlite` transaction locking
with any portable advisory-lock alternative that satisfies the plugin's
self-contained distribution constraints. The issue text does not select the
primitive; a new ADR does.

## Partial supersession

This decision partially supersedes ADR-0014's statement that qualification
retirement preserves every existing recovery guarantee. The retirement
remains unchanged, but it no longer adopts an unimplementable
inode-conditional stale-lock guarantee as acceptance for PR #49.

All other ADR-0014 decisions remain current.

## Consequences

- Qualification retirement stays reviewable and does not absorb a lock
  subsystem migration.
- The repository records the inherited correctness risk instead of claiming a
  test-hook-safe approximation closes it.
- Preview Wisp retains a known stale-recovery race until issue #50 is
  implemented.
- A future lock redesign receives its own evidence, migration analysis, and
  decision rather than being selected incidentally during remediation.

## Rejected alternatives

### Add another final pathname reread

Rejected because a replacement can still occur between that reread and the
rename. It makes a deterministic hook test pass without establishing the
claimed atomicity.

### Add an unrecoverable cooperative claim

Rejected because a process crash can leave the claim permanently blocking
stale-lock recovery. Making that claim recoverable with the same pathname
primitives recreates the race recursively.

### Choose SQLite in this PR

Rejected because it changes the runtime lock protocol, generated project
state, failure model, and migration surface. It deserves research and an ADR
under issue #50.

### Hide or downgrade the finding

Rejected because the race can remove a live owner's lock and permit concurrent
writers. Its inherited status explains scope; it does not make the harm
advisory.

## Acceptance criteria

- PR #49 and SPEC-0001 name issue #50 and the inherited final-gap limitation.
- No text claims that final reread plus pathname rename conditionally retires
  the inspected directory inode.
- Existing exact-record, raw-byte, missing-owner, and pre-rename mismatch
  checks remain tested and unchanged.
- PR #49 adds no new lock dependency, daemon, CLI, native addon, or generated
  lock database.
- The final-line callback regression proves the changed canary does not leak a
  surviving same-group descendant.
- Issue #50 remains the sole implementation venue for the crash-safe lock
  redesign and requires a new ADR before code.

## Self-check

- **Internal coherence:** the decision distinguishes an inherited product
  defect from the qualification machinery being retired.
- **Evidence:** the two-recoverer replacement probe demonstrates the race;
  Node 24's exposed filesystem API lacks an inode-conditional rename.
- **Scope:** no replacement primitive is selected or implemented here.
- **Risk honesty:** the race remains high-impact and explicitly visible as a
  Preview limitation.
- **Reversibility:** issue #50 can supersede this limitation with a
  claim-scoped lock decision.

## Lifecycle record

The implementation review of PR #49 exposed the final-gap race and the
executor confirmed that portable dependency-free Node 24 does not expose the
required conditional-rename primitive. The maintainer explicitly chose the
scoped resolution in-session on 2026-07-26: keep qualification retirement
focused, document and park the inherited defect, and evaluate a crash-safe
lock primitive separately. The shaper moved this record to `gated` for
independent soundness review.

The independent decision adversary returned `SOUND`
([durable PR record](https://github.com/kodhama/wisp/pull/49#issuecomment-5082729814)).
The maintainer's explicit in-session selection of this exact scoped direction
is the human intent act; `approved` records that ratification.
