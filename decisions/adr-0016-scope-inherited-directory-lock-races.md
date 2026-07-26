---
id: adr-0016-scope-inherited-directory-lock-races
type: adr
status: approved
depends_on:
  - adr-0002-plugin-mcp-distribution
  - adr-0014-retire-preview-qualification-machinery
owner: human
updated: 2026-07-26
changes:
  - spec-0001-plugin-mcp-distribution@v14
---

# ADR-0016 — Scope inherited directory-lock races out of qualification retirement

## Decision state

### Decided

- PR #49 remains a qualification-retirement change and does not expand into a
  replacement of Wisp's cross-process write-lock subsystem.
- The known Preview limitation covers every non-atomic
  match-to-pathname-mutation seam in the current directory-lock protocol, not
  only stale recovery.
- Derived guarantees that depend on uninterrupted exclusive ownership are
  limited by the same race: rollback can remove a later committed append and
  concurrent projected-size checks can exceed the nominal bus maximum.
- Failed acquisition cleanup on a non-`EEXIST` error is another inherited
  pathname exposure: it unconditionally addresses the canonical owner and
  lock paths without verifying the owner token.
- The current committed-release horizon and scheduler are documented as
  implemented, not represented as a stronger unref-only background boundary.
- Issue #50 owns research, decision, implementation, and migration of a
  crash-safe replacement lock.
- The bounded final-line callback cleanup fix remains in PR #49.

The maintainer selected the scoped direction in-session on 2026-07-26.
Independent spec review then expanded the demonstrated blast radius from the
stale-recovery seam to the complete directory-lock protocol; this decision
corrects the record without changing that direction.

### Open

- None for PR #49.

### Parked

- Selection of the replacement primitive. Node 24 built-in `node:sqlite`
  transaction locking remains the first candidate to research, not a decision
  made here.
- The replacement protocol's storage, migration, compatibility, and cleanup
  details.

## Context

ADR-0015 recorded that stale recovery rereads `owner.json` and then renames
the canonical lock directory through a separate pathname operation. It
correctly concluded that portable dependency-free Node 24 cannot condition
that rename on the directory inode that supplied the reread.

Independent review of SPEC-0001 v13 found that the same limitation exists in
normal held-lock and committed-lock release. A release path can match owner A,
pause, and later rename a newly acquired owner B's directory after another
actor retired A. The different pathname occupant is not distinguishable by
the earlier record match.

Source conformance at head `3ed816e` established further exact current
behavior. The 5,000 ms acquisition deadline is computed immediately before
owner construction and the first `mkdir`, rather than at that first
filesystem call. On any non-`EEXIST` acquisition error, cleanup
unconditionally attempts `unlink(ownerPath)` and then `rmdir(lockPath)`
without owner-token verification, so replacement or substitution can direct
cleanup at another pathname occupant. Committed release computes its
5,000 ms horizon after the protected `operation()` returns, at the start of
committed release. Its
background scheduler uses an unref'd outer 50 ms timer, but each worker invokes
`releaseCommittedLock` with a 45 ms deadline whose repeated 10 ms delays are
ordinary referenced waits. The 250 ms and 45 ms deadlines admit attempts
while `Date.now()` is at or before the deadline; an admitted filesystem
operation or final 10 ms wait can finish after its local deadline. The
5,000 ms horizon likewise governs background-worker admission and
rescheduling rather than imposing a hard completion cutoff: a worker admitted
at or before the horizon can finish, including successfully, after it.

Once that interleaving permits two operations to believe they acquired the
lock, two further guarantees no longer hold absolutely:

- a pre-commit short-write rollback to an earlier file size can truncate a
  later operation's completed append; and
- two projected-size checks can both pass against the same prior size and
  append beyond the nominal bus maximum.

The pathname race and these consequences are inherited from `main`. PR #49
did not introduce them. Their impact remains correctness- and data-safety
relevant; inherited status controls scope, not severity.

## Decision

### Keep qualification retirement scoped

PR #49 SHALL retire aggregate qualification machinery, preserve Preview
distribution, and retain its bounded canary and owner-validation repairs. It
SHALL NOT add a native addon, daemon, CLI, package-manager install step,
SQLite lock, or new runtime lock protocol.

The PR SHALL identify issue #50 as the sole redesign venue and SHALL NOT claim
that the inherited lock races are fixed.

### State the whole limitation

SPEC-0001 SHALL describe the current directory-lock implementation exactly:

- acquisition uses atomic `mkdir` and exclusive owner creation;
- record and raw-byte equality checks authorize later pathname operations;
- each rename atomically moves whichever directory occupies the canonical
  pathname when the rename executes;
- no current Node filesystem operation couples the earlier equality check to
  the later pathname mutation by inode identity; and
- replacements, disappearance, symlink/type substitution, or rename failure
  in that final gap follow the observed filesystem operation and error, not
  an inode-conditional guarantee;
- on every non-`EEXIST` acquisition error, cleanup unconditionally attempts
  `unlink(ownerPath)` followed by `rmdir(lockPath)` without owner verification,
  and replacement or substitution follows those pathname operations; and
- committed release starts its 5,000 ms horizon after `operation()` returns;
  background retries use unref'd outer 50 ms timers, each invoking a 45 ms
  release attempt whose internal 10 ms delays remain referenced; the 250 ms
  synchronous and 45 ms worker deadlines admit attempts rather than bounding
  their completion, and a worker admitted at or before the horizon can finish
  after it.

The limitation applies to stale recovery, held release, committed release,
any cleanup path that matches state before mutating the canonical pathname,
and acquisition-failure cleanup that mutates the canonical owner and lock
paths without first matching state.

SPEC-0001 SHALL also state that, under an overlap caused by this final-gap
race, the current implementation cannot guarantee:

- uninterrupted exclusive ownership through append;
- preservation of another operation's later committed bytes during
  short-write rollback; or
- enforcement of the nominal projected bus-size maximum across the
  overlapping operations.

Outside that known overlap, the existing event schema, exact serialization,
size accounting, append commit point, identity validation, snapshot equality,
and fail-closed observed-mismatch rules remain the current contract.

### Redesign separately

Issue #50 SHALL require a crash-releasing serialization primitive that makes
lock ownership and the protected append interval one enforceable
cross-process boundary. Its acceptance SHALL include stale recovery, normal
release, acquisition-failure cleanup replacement,
rollback-versus-later-commit, and near-limit concurrent append interleavings.

The future decision SHALL compare Node 24 built-in `node:sqlite` transaction
locking with any portable alternative that preserves self-contained plugin
distribution. This ADR does not select the primitive.

## Supersession

This decision supersedes ADR-0015 in full. ADR-0015's scope direction and
platform evidence remain valid, but its limitation boundary was incomplete.

This decision partially supersedes ADR-0014 only where that decision adopted
absolute directory-lock exclusivity, rollback preservation, exact concurrent
bus-size enforcement, or matching-owner pathname mutation as retained
acceptance for PR #49. All qualification-retirement, Preview, distribution,
dashboard, process-identity, and capability-safety decisions remain current.

## Consequences

- PR #49 remains focused on qualification retirement.
- The contract exposes the complete inherited risk instead of moving the
  overclaim from stale recovery to release, rollback, or size accounting.
- Preview users may still encounter concurrent writers, lost later bytes, or
  an over-limit bus under the demonstrated final-gap interleaving until issue
  #50 lands.
- The lock redesign receives an independent research/ADR/build cycle.

## Rejected alternatives

### Limit the record to stale recovery

Rejected because held and committed release perform the same separate
match-and-pathname-rename sequence.

### Preserve absolute rollback and size guarantees

Rejected because those guarantees depend on exclusive ownership that the
known final-gap race can break.

### Specify every final-gap filesystem outcome as safe

Rejected because disappearance, path-type substitution, and replacement are
ordinary pathname races. The current implementation can report or observe
their actual filesystem result but cannot make them conditional on the inode
previously checked.

### Redesign the lock in PR #49

Rejected for the same scope reason as ADR-0015: it changes runtime state,
failure semantics, and migration behavior and deserves issue #50's own ADR.

## Acceptance criteria

- ADR-0015 points forward and is marked superseded.
- SPEC-0001 advances to v14 and names the limitation across stale recovery,
  held release, committed release, acquisition-failure cleanup, rollback, and
  concurrent size accounting.
- SPEC-0001 states the post-operation horizon start and distinguishes the
  unref'd outer 50 ms scheduler from each 45 ms release attempt's referenced
  10 ms delays.
- SPEC-0001 states that the acquisition deadline is computed immediately
  before owner construction and the first `mkdir`.
- No text claims inode-conditional mutation, uninterrupted exclusivity, later
  commit preservation during overlapping rollback, or exact concurrent bus
  bounds under the known final-gap interleaving.
- All guarantees outside that explicit overlap remain unchanged.
- Issue #50 includes release replacement, rollback-after-later-commit, and
  concurrent near-limit acceptance cases.
- PR #49 introduces no new lock primitive or dependency.
- The final-line callback regression passes.

## Self-check

- **Internal coherence:** every guarantee derived from lock exclusivity carries
  the same explicit final-gap limitation.
- **Evidence:** exact source contains separate match and pathname mutation in
  recovery and release, unconditional acquisition-failure pathname cleanup,
  and the nested committed-release scheduler; the derived rollback and size
  interleavings follow.
- **Scope:** the decision documents inherited behavior and defers replacement.
- **Risk honesty:** possible concurrent writers, lost committed bytes, and
  over-limit buses are named explicitly.
- **Reversibility:** issue #50 can replace the limitation with a new,
  independently reviewed lock contract.

## Lifecycle record

ADR-0015 received an independent `SOUND` verdict and the maintainer ratified
its scoped direction. SPEC-0001 v13's independent intrinsic review then found
that ADR-0015 named only one occurrence of a protocol-wide pathname race and
omitted its rollback and size consequences. ADR-0016 preserves the ratified
direction, corrects the demonstrated blast radius, and was gated for
independent soundness review.

The first decision-adversary pass returned `NEEDS-REVISION` because ADR-0014
did not point directly to its new partial superseder. ADR-0014 now names
ADR-0016 and records the ADR-0015 lineage. The targeted re-review returned
`SOUND`
([durable PR record](https://github.com/kodhama/wisp/pull/49#issuecomment-5082789674)).
The maintainer's explicit selection of the scoped document-and-park direction
is the human intent act; `approved` records that ratification. The expanded
release, rollback, and size text corrects evidence within that direction.

Targeted source-conformance review at exact head `3ed816e` then found that the
ratified limitation omitted unconditional acquisition-failure cleanup and
described committed background release too abstractly. This amendment records
the acquisition deadline's pre-owner-construction start, existing unlink/rmdir
exposure, post-operation horizon start, and outer-unref/inner-referenced
scheduler without selecting a fix or changing the approved document-and-park
direction. Status remains `approved`; issue #50 still owns redesign.
