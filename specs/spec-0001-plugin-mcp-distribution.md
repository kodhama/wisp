---
id: spec-0001-plugin-mcp-distribution
type: spec
status: gated
depends_on:
  - adr-0004-codex-session-bootstrap
  - adr-0005-plugin-dashboard-lifecycle
  - adr-0008-retire-family-release-certification
  - adr-0009-independent-plugin-package-metadata
  - adr-0011-node-24-only-support
  - adr-0014-retire-preview-qualification-machinery
  - adr-0017-bound-preview-directory-lock-contract
implements: adr-0017-bound-preview-directory-lock-contract
owner: agent
updated: 2026-07-26
version: 15
---

# SPEC-0001 — Dual-host Wisp plugin, bundled stdio MCP, and project dashboard

> **AMENDED 2026-07-26**
> **WHAT:** Replaced v14's positive project-bus `.wisp/write.lock`
> mutual-exclusion and append-ordering contract with the minimal Preview
> boundary, explicitly preserved ADR-0005's separate dashboard contract,
> distinguished “no redesign or correctness claim” from PR #49's retained
> repairs, excluded project-bus-lock-origin failures from generic error and
> diagnostic guarantees, and advanced the behavioral version to 15.
> **WHY:** Human-approved ADR-0017 supersedes ADR-0016's attempt to normatively
> encode inherited project-bus mechanics; its targeted decision-adversary pass
> found the first wording overbroad enough to swallow dashboard ownership and
> factually overstated PR #49's runtime-lock scope.
> **SCOPE:** Lock constants and prose, S47/S51/S52/S70/S74,
> S17/S18, R19/R21, R58/R66–R69/R88/R90/R92–R94, HTTP/MCP error and stdio
> prose, verification matrix, rubric, and gate record.
> Unrelated schema, validation, exact serialization, project confinement,
> per-operation byte accounting, ADR-0005 user-runtime dashboard ownership,
> distribution, and security guarantees remain current.
> **POINTER:** ADR-0017 and its targeted decision-adversary repair.
> **VALUE:** A Preview user can distinguish Wisp's retained data and dashboard
> contracts from project-bus lock behavior that is not promised until issue
> #50 lands.
> **CONFIDENCE:** verified.

> **AMENDED 2026-07-26**
> **WHAT:** Corrected v14 to the source-exact acquisition-deadline start,
> committed background-release scheduler, post-operation horizon start, and
> unconditional non-`EEXIST` acquisition-failure cleanup.
> **WHY:** Conformance at exact head `3ed816e` found that the spec called all
> inner background work unref'd, started the horizon too early, and invented
> token verification that the acquisition-error cleanup does not perform; it
> also measured acquisition from the first `mkdir` rather than the preceding
> deadline computation.
> **SCOPE:** Constants, acquisition cleanup, committed release timing,
> S47/S51/S74, R58/R67/R92–R94, verification matrix, rubric, and gate record.
> Version remains 14 and ADR-0016 remains the implemented decision because
> this records inherited current behavior without selecting a lock redesign.
> **POINTER:** ADR-0016 source-conformance amendment at head `3ed816e`.
> **VALUE:** A Preview user sees which timers actually keep the process alive
> and that failed acquisition cleanup can act on an unverified replacement
> lock.
> **CONFIDENCE:** verified.

> **AMENDED 2026-07-26**
> **WHAT:** Closed three intrinsic v14 exactness gaps: short-write rollback
> outcomes, pathname-addressed post-rename cleanup, and distinct committed,
> held/pre-commit, retired-cleanup, and stale-recovery budgets.
> **WHY:** The first intrinsic spec-adversary pass found that v14 implied
> byte-identical rollback restoration, omitted cleanup's own substitution
> exposure, and applied committed-release retry behavior too broadly.
> **SCOPE:** Fixed constants, append failure/commit prose, quarantine and
> retired cleanup, release timing, S47/S51/S74, R66/R67/R92–R94, verification
> matrix, rubric, and gate record. Version remains 14 because this repair
> states the current implementation and ADR-0016 boundary exactly without a
> new product decision.
> **POINTER:** First intrinsic `NEEDS-REVISION` pass for SPEC-0001@v14.
> **VALUE:** A Preview user can distinguish preserved original bytes from
> best-effort suffix rollback and can see exactly when cleanup and retries stop
> being owner-coupled.
> **CONFIDENCE:** verified.

> **AMENDED 2026-07-26**
> **WHAT:** Expanded the inherited directory-lock limitation from stale
> recovery to every owner-match-to-canonical-path mutation seam and bounded
> the exclusivity-derived rollback and concurrent-size guarantees to periods
> without the documented final-gap overlap.
> **WHY:** ADR-0016 supersedes ADR-0015 after independent review demonstrated
> the same pathname race in held and committed release and showed that an
> overlap can lose later committed bytes or exceed the nominal bus maximum.
> **SCOPE:** Lock recovery, held/committed release and cleanup, final-gap
> filesystem outcomes, append rollback, projected-size accounting, GWT, EARS,
> verification, rubric, and gate record; version advanced from 13 to 14.
> Event schema, exact serialization, per-operation size accounting, append
> commit point, identity validation, snapshot equality, observed-mismatch
> refusal, and every unrelated product guarantee remain unchanged outside the
> explicit overlap.
> **POINTER:** ADR-0016 and issue #50.
> **VALUE:** A Preview user sees the complete current data-safety boundary
> without mistaking owner checks for uninterrupted cross-process exclusion.
> **CONFIDENCE:** verified.

> **AMENDED 2026-07-26**
> **WHAT:** Replaced the absolute final-reread-to-rename stale-lock guarantee
> with the checks Wisp actually provides and recorded the inherited final-gap
> race as a Preview limitation tracked by issue #50.
> **WHY:** ADR-0015 establishes that portable dependency-free Node 24
> filesystem APIs cannot condition pathname rename on the inode that supplied
> the reread snapshot and keeps the crash-safe lock redesign out of
> qualification retirement.
> **SCOPE:** Stale-lock recovery prose, GWT and EARS acceptance, verification
> evidence, rubric, and gate record; version advanced from 12 to 13. Exact
> valid-owner equality, malformed-owner byte equality, missing-owner equality,
> observed-mismatch refusal, atomic pathname quarantine, and all unaffected
> runtime, dashboard, distribution, and qualification-retirement guarantees
> remain unchanged.
> **POINTER:** ADR-0015 and issue #50.
> **VALUE:** A Preview user sees the real inherited concurrency risk instead
> of receiving a stronger lock-safety promise than the runtime can enforce.
> **CONFIDENCE:** verified.

> **AMENDED 2026-07-26**
> **WHAT:** Closed four intrinsic safety gaps in v12: malformed bus-lock
> salvage, schema-invalid dashboard-owner refusal, capability sink/location
> semantics, and exact compact-event serialization and byte boundaries.
> **WHY:** The first intrinsic spec-adversary pass found that the approved
> runtime guarantees were under-specified at recovery races, secret-bearing
> transient boundaries, and serialization limits.
> **SCOPE:** Bus-lock recovery, dashboard-owner validation, capability
> persistence, event serialization, acceptance criteria, verification matrix,
> rubric, and gate record. Version remains 12 because this repair makes the
> existing safety contract testable without adding a product or ADR choice.
> **POINTER:** First intrinsic `NEEDS-REVISION` pass for SPEC-0001@v12.
> **VALUE:** A Wisp user gets fail-closed ownership recovery and byte-exact
> event handling without weakening dashboard capability secrecy.
> **CONFIDENCE:** verified.

> **AMENDED 2026-07-26**
> **WHAT:** Retired the aggregate qualification and exact-surface carriers,
> restored the distributed payload to eight paths, advanced every retained
> package-version carrier to `0.2.1-rc.4`, and made Preview/no-support
> disclosure explicit while preserving product behavior and safety checks.
> **WHY:** ADR-0014 approves Preview distribution without standing
> certification state and preserves ordinary CI, deterministic E2E, live
> drift smoke, Node 24 compatibility, and every runtime/security guarantee.
> **SCOPE:** Package inventory and identity, README posture, ordinary quality
> checks, acceptance criteria, verification evidence, and removal of
> qualification/surface schemas, joins, transitions, digests, disclosures,
> and release gates; version advanced from 11 to 12. MCP tools, project
> binding, bus semantics, dashboard lifecycle/security/recovery, qualified
> process identity, and capability-safe evidence behavior are unchanged.
> **POINTER:** ADR-0014.
> **VALUE:** A Preview user receives the same safe, deterministic plugin
> without mistaking package metadata or smoke results for a support promise.
> **CONFIDENCE:** verified.

> **AMENDED 2026-07-25**
> **WHAT:** Narrowed runtime support and qualification to Node.js 24 only,
> set the distributed bundle target to `node24`, and advanced the complete
> candidate identity to `0.2.1-rc.3` with a recomputed bundle digest and
> deterministic surface disclosures across qualification transitions.
> **WHY:** ADR-0011 removes the unsupported Node.js 20/22 promises and
> requires changed candidate bytes to receive a new independent identity.
> **SCOPE:** Supported-runtime constant, bundle target, candidate carriers,
> derived surface disclosures, qualification reset and promotion
> states, release conditions, acceptance criteria, and verification evidence;
> version advanced from 10 to 11. Host adapters, MCP, bus, dashboard, skills,
> marketplace provenance, and capability-safe evidence behavior remain
> unchanged.
> **POINTER:** ADR-0011.
> **VALUE:** A Wisp user receives one honestly identified candidate whose
> declared runtime, generated bundle, and qualification evidence agree on the
> sole supported Node.js line.
> **CONFIDENCE:** verified.

> **AMENDED 2026-07-24**
> **WHAT:** Added the Wisp-local `VERSION` authority, ten-path payload,
> dual-manifest and runtime-carrier parity, and closed product-owned surface
> metadata joined to existing qualification and optional Stewards marketplace
> observations; corrected the payload scenario and bounded the existing
> dashboard-success scenario to its stated safe-startup conditions.
> **WHY:** ADR-0009 assigns changed candidate bytes the honest independent
> `0.2.1-rc.2` identity, and ADR-0010 keeps structural observation validity
> separate from authenticated runtime provenance.
> **SCOPE:** Package identity, plugin inventory, surface metadata, README
> availability wording, their static verification, and acceptance-clause
> exactness; version advanced from 9 to 10. MCP, bus, skill, host-binding, and
> qualification behavior remain unchanged. The dashboard implementation is
> unchanged; S32 now states the preconditions of its existing success case.
> **POINTER:** ADR-0009 and ADR-0010.
> **VALUE:** A Wisp user and maintainer can identify one candidate and inspect
> its actual qualification and marketplace-observation provenance without an
> invented registration, support, or release claim.
> **CONFIDENCE:** verified.

> **AMENDED 2026-07-24**
> **WHAT:** Retired the family release-certification additions from v7-v8,
> restored the v6 product-owned dual-host, dashboard, and qualification
> contract, and retained v8's independent capability-safe evidence boundary.
> **WHY:** ADR-0008 narrows the intended Stewards integration to factual
> marketplace-test metadata and CI marketplace-step authoring; shared release
> history, approval, runtime, and certification machinery are outside Wisp.
> **SCOPE:** Version/dependency identity and retirement of only the shared
> family release additions. Existing dashboard, qualification, host adapter,
> bus, security, capability-safe evidence, and payload behavior remains
> unchanged.
> **POINTER:** ADR-0008.
> **VALUE:** Wisp returns to a bounded product contract without losing the
> independently validated dashboard and Codex behavior.
> **CONFIDENCE:** verified.

> **AMENDED 2026-07-24**
> **WHAT:** Added the explicit `wisp_dashboard` tool, authenticated local
> dashboard, cross-session project-singleton discovery, dashboard skill,
> shutdown/recovery lifecycle, and dashboard qualification contract.
> **WHY:** ADR-0005 approved a command-capable dashboard in the plugin while
> retaining host-owned stdio MCP processes, one project bus, no daemon, and no
> implicit listener startup.
> **SCOPE:** Tool and payload inventory, reusable component boundaries,
> project write-lock and user-runtime filesystem contracts, local HTTP/UI
> surface, lifecycle, errors, skills, qualification, and acceptance criteria;
> version advanced from 5 to 6. Existing event and bus semantics remain
> unchanged.
> **POINTER:** ADR-0005.
> **VALUE:** A Claude Code or Codex user can explicitly open one secure Wisp
> dashboard for the current project without paths, ports, or another install.
> **CONFIDENCE:** verified.

> **AMENDED 2026-07-24**
> **WHAT:** Replaced Codex MCP-roots project binding with a host-selected
> session-directory bootstrap that binds `WISP_PROJECT_ROOT` before importing
> the installed bundle.
> **WHY:** Live Codex 0.145.0 qualification and protocol capture proved that
> Codex advertises no roots capability or project metadata, while Codex source
> confirms that an MCP definition without `cwd` launches from the active
> session directory.
> **SCOPE:** Codex launch adapter and qualification contract; version advanced
> from 4 to 5. Tool and bus semantics remain unchanged.
> **POINTER:** ADR-0004, which supersedes ADR-0002's Codex roots assumption.
> **VALUE:** One user install works in Codex CLI without project configuration
> or a model-authorized filesystem path.
> **CONFIDENCE:** verified.

> **AMENDED 2026-07-23**
> **WHAT:** Replaced the invalid custom Codex MCP-config reference with the
> supported inline `mcpServers` manifest form and reduced the exact payload
> inventory from eight files to seven.
> **WHY:** Primary Codex manifest validation rejects `./mcp/codex.json` and
> accepts an inline server object; Claude still requires root `.mcp.json`.
> **SCOPE:** Host-distribution contract correction; version advanced from 3
> to 4. All runtime behavior remains unchanged.
> **POINTER:** ADR-0002, “Ownership and distribution,” source-driven
> correction.
> **VALUE:** Both host packages validate using their actual supported formats
> without adding an unnecessary file.
> **CONFIDENCE:** verified.

## Scope

This specification defines one Wisp-owned, self-contained plugin with
separate Claude and Codex distributions, one bundled stdio MCP server, a
lazy project-singleton dashboard, portable lifecycle and dashboard skills,
product-owned package identity, and Preview documentation. Marketplace
presence is not a support claim or part of the runtime contract.

MCP is the plugin's only launchable executable interface. Claude binds from
its official project substitution; Codex binds from its host-selected active
session directory. Neither requires Wisp project configuration. Other MCP
clients may use the single-file-root fallback. Legacy CLI source may remain
outside the plugin, but this release defines and ships no CLI, binary
declaration, or CLI compatibility behavior.

The bundled MCP process starts a loopback HTTP listener only after an explicit
`wisp_dashboard` call. The listener belongs to that process, while a private
user-runtime record lets other Claude Code or Codex sessions reuse it for the
same canonical project. No shared MCP daemon or detached dashboard process is
installed.

Remote transport, hosted multi-tenancy, a standalone dashboard mode,
OpenTelemetry, CloudEvents, npm, and Homebrew publication are outside this
specification.

## Fixed product constants

All implementations and generated schemas SHALL import these values from one
versioned source module; manifests and package tests MAY duplicate only values
required by their external formats.

| Constant | Value |
|---|---:|
| Protocol version | `1` |
| Dashboard protocol version | `1` |
| Default project bus | `.wisp/events.ndjson` |
| MCP roots-list timeout | `5,000 ms` |
| Dashboard capability entropy | `32 random bytes` |
| Dashboard capability encoding | unpadded base64url, exactly `43 ASCII characters` |
| Dashboard project key | lowercase SHA-256 of the canonical-project UTF-8 bytes |
| Dashboard health timeout | `500 ms` |
| Dashboard startup convergence timeout | `2,000 ms` |
| Dashboard startup poll interval | `50 ms` |
| Dashboard HTTP header deadline | `5,000 ms` |
| Dashboard HTTP header maximum | `16,384 bytes` |
| Dashboard request/body deadline | `5,000 ms` |
| Dashboard total request deadline | `10,000 ms` |
| Dashboard idle-socket timeout | `5,000 ms` |
| Dashboard shutdown grace | `1,000 ms` |
| Dashboard request-body maximum | `32,768 UTF-8 bytes` |
| Dashboard process-identity maximum | `512 UTF-8 bytes` |
| Identifier maximum | `128 UTF-8 bytes` |
| Verdict maximum | `256 UTF-8 bytes` |
| Activity or acknowledgement note maximum | `2,048 UTF-8 bytes` |
| Question text maximum | `4,096 UTF-8 bytes` |
| One reference maximum | `512 UTF-8 bytes` |
| References per event maximum | `32` |
| Serialized event maximum, excluding newline | `32,768 UTF-8 bytes` |
| Bus file read maximum | `16,777,216 bytes` |
| One bus line maximum, excluding newline | `65,536 UTF-8 bytes` |
| Pending commands returned by one check maximum | `1,000` |
| Parse errors returned by one check maximum | `1,000` |
| Required Node runtime line | `24.x` |

An identifier is a JSON string that, after Unicode-preserving trim, is
non-empty, contains no U+0000–U+001F or U+007F code point, and is within the
identifier maximum. It is stored in trimmed form. Text fields are trimmed,
must remain non-empty, must contain no U+0000, and use their table maximum.
References obey the text rule. Optional fields are omitted when absent;
explicit `null` and unknown object properties are invalid.

## Required component boundaries

| Component | Owns | Must not |
|---|---|---|
| Runtime | Constants, domain validation, event stamping, bus reads/appends, command creation/reduction, pending-command filtering, acknowledgement authorization | Parse process arguments, perform MCP framing, or start listeners |
| MCP adapter | Initialization, immutable project resolution, seven tool adapters, MCP result mapping, stdio discipline | Issue or execute commands, use process cwd inside the generic resolver, or accept per-call paths |
| Dashboard coordinator | User-runtime resolution, process identity, singleton acquisition/reuse, listener ownership, publication, recovery, and cleanup | Select a project independently, detach a process, open a browser, or write the bus directly |
| Dashboard HTTP surface | Embedded UI, authenticated health/events/command routes, HTTP validation, and security headers | Start on import, expose a non-loopback listener, execute commands, or use a second event/bus implementation |
| Codex bootstrap | Bind Codex's host-selected session cwd into `WISP_PROJECT_ROOT` and import the installed bundle | Accept model-supplied paths, fetch, install, or emit protocol text |
| Bundled entrypoint | Start the stdio MCP server | Dispatch CLI commands, fetch dependencies, or perform work on import |
| Plugin payload | Exact files named below | Depend on global `wisp`, `npm`/`npx`, project `node_modules`, or a daemon |
| Lifecycle skill | Portable lifecycle guidance using the six event/check MCP tools | Define transport mechanics or consumer-specific governance |
| Dashboard skill | Explicitly call `wisp_dashboard` and present its returned link | Invent a URL, start a legacy server, invoke a shell, or open a browser itself |
| Stewards entry | Thin `git-subdir` pointer | Copy or independently version Wisp |

Importing any reusable module SHALL parse no arguments, start no MCP or HTTP
listener, emit no output, and perform no bus I/O.

## Project resolution and filesystem contract

Resolution runs at most once per MCP process, after initialization and before
the first named tool performs project work. This includes
`wisp_dashboard` when it is the first invoked tool, before user-runtime
resolution, discovery, or listener creation. The success or failure is
memoized for the process lifetime.

1. If `WISP_PROJECT_ROOT` is present at process launch, its value SHALL be a
   non-empty absolute path to an existing directory. The directory's real
   path is the project. A blank, relative, missing, non-directory, or
   unresolvable value returns `project_unresolved` with reason
   `invalid_environment_root`; it never falls through.
2. Otherwise, if the client did not advertise the MCP roots capability,
   resolution returns `project_unresolved` with reason `roots_unsupported`.
3. Otherwise the server sends `roots/list` with a 5,000 ms timeout. A protocol
   failure, rejection, or timeout returns reason `roots_list_failed`.
4. The response SHALL contain exactly one root entry. Zero entries return
   `roots_absent`; more than one returns `roots_ambiguous`.
5. The sole URI SHALL be a local `file://` URI with no query or fragment and
   with an empty authority or `localhost`. It SHALL decode to an existing
   directory. Any violation returns `invalid_file_root`.
6. The real path of that directory is the project.

Process cwd inside the generic resolver, `GROVE_EVENTS`, other environment
variables, and tool arguments SHALL NOT affect MCP selection. The Codex
adapter is the sole exception before server import: its host-selected launch
cwd is copied into `WISP_PROJECT_ROOT`, after which the ordinary explicit-root
contract applies. A roots change notification after resolution does not
retarget the process.

The bus path is exactly `<real-project>/.wisp/events.ndjson`.

- After canonicalizing the project, Wisp SHALL verify every existing path
  component it owns with `lstat`. If `.wisp` exists, it SHALL be a real
  directory and not a symbolic link. If `events.ndjson` exists, it SHALL be a
  real regular file and not a symbolic link.
- The canonical `.wisp` directory and bus parent SHALL remain within the
  canonical project. A symlink, wrong type, or containment failure returns the
  applicable stable bus error before bus content I/O.
- Reading a nonexistent bus returns zero events and zero parse errors and
  creates nothing.
- The first successful append creates `<project>/.wisp` if absent, rechecks
  its type and containment, opens a new or existing real regular bus in append
  mode, and performs one append of one compact JSON object plus `\n`.
- A write SHALL first validate the event and its serialized size. Failed
  validation creates or modifies nothing.
- Byte maxima are counted on the exact UTF-8 byte sequence. A read SHALL
  reject a file larger than the bus maximum before parsing and SHALL never
  return a partial/truncated result.
- Bus bytes SHALL decode as UTF-8 with fatal error handling; any invalid byte
  sequence returns `bus_unreadable/invalid_utf8`.
- Decoded text is split on LF (`U+000A`). The final unterminated segment is
  processed. Exactly one trailing CR (`U+000D`) is removed from each segment.
  A segment is blank only when it is then zero-length; whitespace-only
  segments are parsed and therefore become `invalid_json`.
- Each segment's UTF-8 byte length after the optional CR removal SHALL be at
  most the line maximum. An excess returns `bus_limit_exceeded`; no partial
  commands or parse errors are returned.
- Every nonblank malformed line becomes a parse-error record with its 1-based
  segment number, reason `invalid_json` or `invalid_event`, and raw decoded
  segment after CR removal.
- If pending-command or parse-error counts exceed their maxima,
  `wisp_check` returns `bus_limit_exceeded`; it SHALL NOT silently truncate.
- Permission, path-type, stat, open, read, and append failures use the stable
  bus errors below and never select another path.

## Qualified process-identity contract

Dashboard ownership uses the qualified process-identity provider below. A PID
without its birth identity is never a qualified dashboard-owner identity and
never proves that a recorded dashboard owner is still the same process
instance. This provider contract creates no guarantee for project-bus locking.

The exact supported providers are:

- **Linux:** read and validate lowercase UUID `boot_id` from
  `/proc/sys/kernel/random/boot_id`, then read `/proc/<pid>/stat`. Match the
  requested decimal PID prefix, find the closing `)` whose following suffix
  parses as fields 3 onward, and read decimal unsigned field 22 (`starttime`,
  clock ticks since boot). Spaces and `)` inside `comm` do not change field
  selection. The token is `linux:<boot_id>:<starttime>`.
- **macOS:** execute absolute `/bin/ps` directly, never through a shell, with
  arguments `["-p", "<decimal-pid>", "-o", "lstart="]` and environment
  `LC_ALL=C`. Accept exactly one trimmed line matching
  `^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [ 0-3][0-9] [0-2][0-9]:[0-5][0-9]:[0-5][0-9] [0-9]{4}$`
  whose date/time components form a real local timestamp. Normalize the
  day-of-month to two decimal digits. The token is
  `darwin:<YYYY>-<MM>-<DD>T<HH>:<mm>:<ss>`.
- **Windows and every other platform:** unsupported until this specification
  is amended with an equally exact birth-identity provider and parser.

Linux `ENOENT` for the PID stat means `absent`. On macOS, `/bin/ps` exit status
`1` with empty trimmed stdout means `absent`; success with empty output or any
other nonzero status is `inconclusive`. Permission denial, malformed provider
output, boot-id failure, timeout, or I/O failure is also `inconclusive`, never
`absent`. Provider diagnostics redact paths, arguments, and raw output.

Parser fixtures SHALL cover valid and malformed boot IDs; Linux `comm` values
with spaces and `)`; short/malformed/non-decimal stat fields; macOS every
month, single- and double-digit days, locale-dependent/malformed output,
impossible dates, multiple lines, missing absolute binary, and nonzero exits.
Runtime-safety tests repeat the current-PID observation for stability, prove a
simultaneously live child has a different token, and prove that child becomes
absent after exit. Deterministic injected evidence presents one PID with
recorded birth token A and later current birth token B. Tests never attempt to
force OS PID reuse.

## Project bus append and Preview lock boundary

MCP reports and acknowledgements and dashboard commands use the same canonical
project-bus append operation. The event schema, validation, exact
serialization, project confinement, and per-operation byte accounting in this
specification apply to each call.

The append commit point means only that the operation completed the full write
of the compact canonical event plus its terminating LF. It does not guarantee
that those bytes will later be preserved or remain durable when same-process
or cross-process bus operations overlap through the project-bus lock.

Wisp Preview makes no guarantee about the current project-bus
`.wisp/write.lock` mutual-exclusion and append-ordering protocol's concurrency,
ownership, recovery, cleanup, path identity, deadlines, timing, error mapping,
or diagnostics. This boundary applies whether bus operations run concurrently
in different processes or within one process. In particular, the
specification makes no aggregate bus-size guarantee across concurrent
operations.

This boundary does not apply to the separate user-runtime dashboard
ownership/coordinator contract under ADR-0005 and the dashboard clauses below.

Issue #50 is the sole venue for project-bus lock correctness, protocol,
migration, and redesign. ADR-0017 adds no further runtime lock change. PR #49
does not redesign the project-bus lock or claim its correctness, while
retaining its already present bounded runtime, owner-validation, append, and
canary repairs.

## Dashboard discovery and ownership contract

Dashboard discovery state lives below the deterministic user-runtime root:

```text
<real-user-home>/.wisp/runtime/dashboard/
  <project-key>/
    owner/
      owner.json
```

`<real-user-home>` is Node's OS-user home after `realpath`. `<project-key>` is
the fixed dashboard project-key digest. Candidate and quarantine directories
are siblings of `owner/` beneath the project-key directory and carry an
unpredictable instance suffix.

The user-home, `.wisp`, and `runtime` ancestors SHALL be existing or
atomically created real directories, not symbolic links, owned by the current
OS user where numeric ownership exists, and not group- or other-writable. The
`dashboard` root and every directory below it SHALL be user-owned, real
directories with permissions no broader than `0700`; files below it SHALL be
user-owned, real regular files with permissions no broader than `0600`.
Created directories and files use `0700` and `0600` respectively. Platforms
without numeric ownership and mode bits SHALL use a qualified platform-native
same-user boundary. Failure to establish the boundary returns
`dashboard_unavailable/runtime_unsafe` and creates no listener.

After canonicalizing both paths, if the canonical project equals or contains
the canonical dashboard runtime root, `wisp_dashboard` returns
`dashboard_unavailable/project_contains_runtime`. It does not choose a
fallback rendezvous. Existing bus tools remain usable.

`owner.json` rejects unknown properties and uses exactly one of these closed
record shapes. Wisp writes protocol `1`:

```json
{
  "schema": 1,
  "protocol": 1,
  "state": "starting",
  "project": "<canonical absolute project path>",
  "project_key": "<64 lowercase hexadecimal characters>",
  "instance": "<lowercase UUID>",
  "pid": 123,
  "process_identity": "<nonblank opaque platform token>",
  "created_at": "YYYY-MM-DDTHH:mm:ss.sssZ"
}
```

```json
{
  "schema": 1,
  "protocol": 1,
  "state": "ready",
  "project": "<canonical absolute project path>",
  "project_key": "<64 lowercase hexadecimal characters>",
  "instance": "<lowercase UUID>",
  "pid": 123,
  "process_identity": "<nonblank opaque platform token>",
  "created_at": "YYYY-MM-DDTHH:mm:ss.sssZ",
  "port": 49152,
  "capability": "<43-character unpadded base64url value>",
  "published_at": "YYYY-MM-DDTHH:mm:ss.sssZ"
}
```

`pid` is a positive integer no greater than the platform maximum. `port` is
an integer from 1 through 65,535. Timestamps use the canonical event timestamp
form and calendar validation. The project path and process identity are
nonblank strings without U+0000; process identity is within its fixed maximum.
The record's project and project key SHALL recompute to the requesting
process's canonical project and key before reuse.

For discovery only, a positive safe-integer `protocol` other than `1` remains
structurally schema-valid so Wisp can prove the complete owner's identity and
return `dashboard_version_conflict`; it is protocol-incompatible, not
schema-invalid. A non-integer, non-positive, or otherwise invalid protocol
follows the unconditional schema-invalid refusal below.

Dashboard ownership uses the shared qualified process-identity contract
above; it does not define a weaker adapter. If the provider is unavailable
before acquisition, return
`dashboard_unavailable/process_identity_unavailable`. If an existing owner's
identity cannot be compared conclusively, return
`dashboard_unavailable/owner_identity_unverifiable` and never take ownership.
Any readable `owner.json` that is invalid against the complete `starting` or
`ready` schema SHALL return
`dashboard_unavailable/owner_identity_unverifiable` with `retryable: false`
immediately. This rule
applies even when the invalid object contains an individually usable PID,
process identity, instance, project, project key, protocol, port, capability,
or timestamp. Wisp SHALL NOT observe such a PID, perform health proof, infer
owner death, quarantine the owner, or continue acquisition from partial
fields.

Startup follows this exact state machine:

1. Read and validate `owner/owner.json`, if present.
2. For a compatible `ready` record, perform the authenticated health proof
   below with the fixed health timeout. Reuse only when protocol, project key,
   and instance all match.
3. For a live compatible `starting` owner, poll at the fixed interval until
   it becomes reusable or the convergence timeout expires.
4. If no owner exists, create a complete private candidate directory
   containing a `starting` record, then atomically rename that directory to
   `owner/`. A contender that loses the rename returns to step 1.
5. After candidate promotion and before bind, the winner rereads
   `owner/owner.json`, recomputes project and process identity, and repeats
   the compatible-owner discovery decision. It proceeds only if the exact
   authoritative record is still its own `starting` instance. A changed,
   missing, reusable, incompatible, or unsafe owner is handled by the same
   reuse/failure rules and the contender does not bind.
6. The owner binds `127.0.0.1` to port `0`, generates the fixed-entropy
   capability, starts the HTTP surface, and atomically replaces `owner.json`
   with its complete `ready` record.
7. Immediately before success, a new owner proves its own health; a reused
   owner is health-proven in step 2. The tool then returns its exact success
   envelope.

A complete candidate directory, rather than a created-then-populated shared
owner directory, is the atomic acquisition primitive. Candidate and ready
records are written through a private temporary file, closed, and atomically
renamed.

Any winner that fails after acquisition but before returning success is a
failed live owner. It first marks its coordinator failed, closes any bound
listener, and then rereads `owner.json` without following links. It atomically
renames `owner/` to a private quarantine sibling and cleans that sibling only
when the record is an exact `starting` or `ready` record whose instance,
PID, process identity, project, and project key all match its own. A missing,
unsafe, malformed, or different record is left untouched. Listener close is
mandatory even when record cleanup cannot complete. The original stable
startup error is returned only after listener closure and this matching-record
cleanup attempt; no failed call leaves its own published owner discoverable.

A live compatible owner is never stolen. A live `starting` owner beyond the
convergence timeout returns `dashboard_unavailable/owner_starting`. A live
compatible `ready` owner that fails or mismatches its health proof returns
`dashboard_unavailable/owner_unhealthy`. A live owner with another protocol
returns `dashboard_version_conflict`. Ownership contention that cannot
converge within the fixed timeout returns
`dashboard_unavailable/ownership_contended`.

A qualified provider result of `absent` or a different birth token proves that
the process instance recorded by a complete schema-valid owner is gone,
including the PID-reuse case. Only then may a contender reread the same valid
instance, atomically rename `owner/` to a private quarantine sibling, and
restart acquisition. A missing owner record fails closed as
`owner_identity_unverifiable`; every schema-invalid owner follows the
unconditional refusal above. PID existence, age, failed health, or
individually usable fields never repair an invalid owner or prove death.
Quarantine cleanup is best-effort and never delays successful publication.

During graceful HTTP shutdown, failed health against the still-live owner
returns `dashboard_unavailable/owner_unhealthy`; callers retry explicitly
after owner cleanup. During an owner-stable interval, any number of processes
for one OS user and canonical project converge on one URL. Different
canonical projects have different keys and listeners even when their
directory basenames match. A returned URL is a point-in-time health proof, not
a lease on the owning session.

## Dashboard HTTP and lifecycle contract

The listener binds exactly IPv4 loopback `127.0.0.1` on an OS-assigned port.
Its only routes are:

| Method and path | Authorization | Success |
|---|---|---|
| `GET /` | none | Embedded dashboard HTML, status `200` |
| `GET /api/health` | bearer capability | Health envelope, status `200` |
| `GET /api/events` | bearer capability | Event/read envelope, status `200` |
| `POST /api/commands` | bearer capability and exact same origin | Appended command envelope, status `201` |

The server tracks every accepted socket from acceptance until close using a
monotonic clock. For the first request, the 5,000 ms header deadline begins at
socket acceptance and ends only when its complete header terminator
`CRLFCRLF` has arrived. For a subsequent keep-alive request, the equivalent
request origin is its first raw byte after the preceding response. Header-byte
accounting is per request: raw octets from the first request-line byte through
and including that terminating `CRLFCRLF`; byte 16,385 fails.

The 5,000 ms body deadline begins at header completion and ends when the full
body declared by valid HTTP framing has arrived; a bodyless request completes
that phase immediately. The observed body counter runs before buffering or
UTF-8 decoding and stops reading at byte 32,769. The 10,000 ms total request
deadline begins at socket acceptance for the first request and at the request
origin for a subsequent keep-alive request; it ends only when the complete
response has been written. The first expired header, body, or total deadline
wins. If no response bytes have begun, expiry sends the exact `408` envelope;
after a response has begun, it destroys the socket and emits only a redacted
stderr diagnostic.

The 5,000 ms idle timeout applies only while a keep-alive socket has no active
request, beginning when the preceding response completes; expiry destroys the
socket. The 1,000 ms shutdown grace begins at cleanup invocation and overrides
all later header, body, total, and idle deadlines: at its expiry every
remaining tracked socket is destroyed and listener close is awaited.

For a syntactically accepted HTTP request, validation runs in this exact
precedence and stops at the first failure:

1. Require exactly one `Host` header equal to
   `127.0.0.1:<bound-port>`.
2. Reject any query string.
3. Resolve the path against the four-route table; reject an unknown path.
4. Check the exact allowed method for that path.
5. For API routes, require exactly one valid bearer authorization header.
6. Validate `Origin`: API reads accept absent or exact same-origin;
   `POST /api/commands` requires exactly one exact same-origin value.
7. If shutdown has begun, reject API work.
8. Reject a request body on any GET route.
9. For the command route, require exactly one
   `Content-Type: application/json`, then enforce declared and observed body
   size and the body and total deadlines.
10. Fatally decode UTF-8, parse one JSON value, and validate the exact command
    schema.
11. Perform canonical runtime work.

Duplicate `Host`, `Authorization`, `Origin`, or `Content-Type` headers fail at
their corresponding step. No later validation, route work, bus read, or bus
write occurs after the first failure. Unexpected hosts or origins are
rejected before application work, and no permissive CORS header is emitted.

The authorization header is exactly `Authorization: Bearer <capability>`.
Missing, duplicated, malformed, or unequal authorization is rejected with the
same response and compared without timing-dependent early exit. The private
ready owner record is the capability's only permitted Wisp-controlled
persistent at-rest location. Transient copies are permitted only in the
owning process's memory,
the MCP-returned URL, the page's in-memory closure, the loopback
`Authorization` header while in transport, and a test harness's volatile
memory:

```text
http://127.0.0.1:<port>/#capability=<capability>
```

The HTML bootstrap accepts exactly that fragment form, immediately removes it
from the visible URL with `history.replaceState`, retains the capability only
in the page's in-memory closure, and sends it as the bearer header. Outside
the private ready record, no transient copy may cross a Wisp-controlled
persistent sink or any output sink except the exact response transports
defined below. The capability SHALL NOT persist in cookies, local storage,
session
storage, query strings, buses, transcripts, evidence, files, caches,
artifacts, uploads, logs, error bodies or objects, stderr diagnostics, health
responses, or analytics. A replacement owner generates a new capability; an
old capability cannot authenticate to it.

The mandated `wisp_dashboard` MCP success response that carries the returned
capability URL and the loopback HTTP request/response transport used by that
dashboard are permitted Wisp-controlled output transports, not persistent
sinks. Outside those exact transports, capability material SHALL cross no
other Wisp-controlled output, log, diagnostic, error, transcript, evidence,
artifact, cache, upload, bus, health-body, or analytics sink.

A host smoke, canary, or browser harness may inspect the MCP-returned
capability URL and construct its bearer header only in volatile process memory
while proving dashboard behavior. Before any transcript or evidence crosses a
filesystem, artifact, cache, log, or upload boundary, the harness SHALL replace
every fragment-form or bearer-form capability with a non-secret structural
redaction sentinel and verify that neither the observed capability bytes nor a
capability-shaped fragment or bearer remains. Failure to establish that check
blocks persistence and upload. The exact Codex artifact transformation and
fixtures are specified by SPEC-0002. During capability-bearing browser steps,
trace, video, screenshot, console, network, attachment, and reporter persistence
SHALL either be disabled or intercepted and sanitized in volatile memory before
the first sink; a later cleanup or deletion is not redaction. Only post-redaction
typed structural fields may persist. A redaction sentinel is not capability
material.

Every response includes `Cache-Control: no-store`,
`X-Content-Type-Options: nosniff`, and `Referrer-Policy: no-referrer`. HTML
also includes a per-response nonce Content Security Policy whose effective
directives are:

```text
default-src 'none'; connect-src 'self'; img-src 'self' data:;
script-src 'nonce-<response-nonce>'; style-src 'unsafe-inline';
base-uri 'none'; form-action 'none'; frame-ancestors 'none'
```

The UI has no external runtime resources. API JSON is UTF-8. The command route
accepts exactly `Content-Type: application/json`, decodes UTF-8 fatally, and
rejects the body before parsing once the fixed request-body maximum is
exceeded.

Authenticated health returns exactly:

```json
{
  "ok": true,
  "data": {
    "protocol": 1,
    "project_key": "<64 lowercase hexadecimal characters>",
    "instance": "<lowercase UUID>"
  }
}
```

Authenticated events returns exactly:

```json
{
  "ok": true,
  "data": {
    "events": [],
    "parse_errors": [],
    "command_states": [
      {
        "run": "run-id",
        "id": "command-id",
        "type": "pause",
        "target": "agent-or-*",
        "issued_by": "maintainer",
        "issued_at": "YYYY-MM-DDTHH:mm:ss.sssZ",
        "status": "pending",
        "payload": {}
      }
    ]
  }
}
```

`events` contains every valid canonical event in physical bus order.
`parse_errors` has the same shape and order as `wisp_check`. The route uses
the canonical bounded bus reader and returns its existing whole-read errors;
it does not truncate, rewrite, or hide malformed lines.

`command_states` is produced by the same command-reduction implementation as
`wisp_check`, not by the HTTP adapter or browser. It processes each run in
first-command appearance order and commands in physical append order. Each
entry adds `run` to the ordinary reduced command fields and includes every
unique command, not only pending or dashboard-issued commands. `status` is
exactly `pending`, `accepted`, `rejected`, or `completed`; `payload` is
omitted when absent. Before-command acknowledgements, other-run
acknowledgements, last-applicable-acknowledgement semantics, and duplicate-id
failure are exactly the canonical command reduction rules. A duplicate within
any run fails the complete route with `command_conflict`; no partial events,
parse errors, or command states are returned.

The command request rejects unknown properties and explicit `null`, and is
exactly:

```json
{
  "run": "<identifier>",
  "type": "pause",
  "target": "<identifier>",
  "payload": {}
}
```

`run`, `type`, and `target` are required and use the canonical identifier and
command-type contracts. `payload` is optional and, when present, is a JSON
object under the existing recursive JSON and event-size rules. Wisp generates
`command.id` as `cmd-<lowercase UUID>`, stamps `agent: "maintainer"`, omits
`to` and `meta`, creates a canonical `command` event, and appends it through
the same canonical project-bus operation as MCP writes. Success is exactly
`{"ok":true,"data":{"event":<canonical-command-event>}}`. Wisp never executes
or automatically acknowledges the command.

The embedded UI is functionally complete at this minimum:

- after capability bootstrap it fetches `/api/events` immediately, refreshes
  every 2,000 ms while the document is visible, and refreshes immediately
  after visibility returns;
- it permits only one in-flight refresh, applies a 5,000 ms client deadline,
  and retains the last successful view while displaying a redacted refresh
  failure;
- it projects valid events in physical append order, groups first by `run` and
  then by `agent`, and orders run and agent groups by their first physical
  appearance. For each agent, the append-order last event of any kind sets
  `last_seen` from that event's `ts`; the append-order last `status` sets
  `state` and sets `activity` to its activity when present or clears activity
  when absent; and the append-order last `verdict` sets `verdict`. With no
  status or verdict, the respective field is absent;
- it renders that projection, the complete physical event timeline,
  server-provided command states grouped under their run and visibly labeled
  `pending`, `accepted`, `rejected`, or `completed`, and every parse error in
  line order with its line, reason, and raw evidence;
- it provides explicit human controls for all seven command types with run,
  target, and type visible before submission; `answer`, `gate`, `steer`, and
  `dispatch` collect their payload as explicit form input;
- a command is submitted only from a user click or form submit, controls are
  disabled while that submission is in flight, and success is shown only
  after the server returns the appended canonical event; and
- every bus, payload, parse-error, and server-error string is inserted with
  text-only DOM APIs (`textContent` or equivalent), never interpreted through
  `innerHTML`, HTML attributes, script, CSS, or a navigable URL.

The UI does not infer acknowledgement, execute commands, auto-submit on
refresh, make references clickable, expose the capability in displayed
errors, or fetch any resource outside its own origin.

HTTP protocol failures return JSON
`{"ok":false,"error":{"code":"<stable-code>"}}` with no other properties:

| First failing condition | Status | Stable code |
|---|---:|---|
| Malformed HTTP request line, header syntax, or body framing | `400` | `http_invalid_request` |
| Header deadline exceeded | `408` | `http_request_timeout` |
| Header bytes exceed 16,384 | `431` | `http_headers_too_large` |
| Missing, duplicate, or non-exact `Host` | `403` | `http_forbidden` |
| Any query string | `400` | `http_invalid_request` |
| Unknown path | `404` | `http_not_found` |
| Wrong method for a known path | `405` | `http_method_not_allowed` |
| Missing, duplicate, malformed, or unequal bearer | `401` | `http_unauthorized` |
| Missing required, duplicate, or non-exact `Origin` | `403` | `http_forbidden` |
| Shutdown begun after authentication | `503` | `http_shutting_down` |
| Body on a GET route | `400` | `http_invalid_request` |
| Missing, duplicate, or non-exact command content type | `415` | `http_unsupported_media_type` |
| Declared or observed body exceeds 32,768 bytes | `413` | `http_body_too_large` |
| Body deadline exceeded | `408` | `http_request_timeout` |
| Total request deadline exceeded before response starts | `408` | `http_request_timeout` |
| Invalid UTF-8, JSON, or command schema | `400` | `http_invalid_request` |

Canonical runtime failures that do not originate in the project-bus
`.wisp/write.lock` protocol use the existing Wisp error envelope:
`invalid_input` returns `400`; `command_conflict` from `/api/events` returns
`409`; `bus_unreadable`, `bus_unwritable`, and `bus_limit_exceeded` return
`500`; and `internal_error` returns `500`. The `409` body preserves the exact
existing `command_conflict` details (`command_id`, `count`) and returns no
partial event data. A project-bus-lock-origin failure has no contracted HTTP
status, error envelope, exception-text treatment, or diagnostic emission.
Regardless of origin, no failure response contains the capability.

The dashboard coordinator is one memoized instance per MCP process. Reusable
module import and ordinary MCP startup create no user-runtime path, candidate,
record, capability, or listener. Only an explicit `wisp_dashboard` call may
start or reuse the HTTP surface.

MCP transport close, `SIGINT`, and `SIGTERM` initiate one idempotent cleanup:
mark the coordinator shutting down, reject newly authenticated API work,
request server close, and wait at most 1,000 ms for active requests and tracked
sockets to drain. At the deadline it destroys every remaining tracked socket
and awaits listener close before continuing. It then rereads `owner.json`
without following links and removes or quarantines `owner/` only if an exact
ready record still names its instance, PID, process identity, project, and
project key. Shutdown completes within the grace period plus filesystem
cleanup and never waits indefinitely for headers, bodies, keep-alive sockets,
or clients.

The HTTP listener SHALL NOT keep the MCP process alive after stdio closes.
Cleanup installs no supervisor, detaches no child, and removes no record owned
by a replacement. Abrupt process death may leave the record for the next
explicit call's proved-dead recovery.

## Canonical event contract

The runtime generates `ts` as an RFC 3339 UTC timestamp with millisecond
precision and always stamps `v: 1`. Callers do not supply either value.

Every stored event is valid only when:

- `v` is the JSON number integer `1`;
- `ts` is a real UTC instant in exact
  `YYYY-MM-DDTHH:mm:ss.sssZ` form (equivalently, it matches
  `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$` and its date/time
  components are valid);
- `run` and `agent` obey the identifier rule;
- `kind` is exactly one of `status`, `heartbeat`, `verdict`, `question`,
  `command`, or `command_ack`;
- it contains all and only the fields allowed for that kind below; and
- the UTF-8 size of its compact JSON serialization is within the event
  maximum, in addition to the raw bus line limit.

“Compact JSON serialization” means the exact string produced under Node.js 24
ECMAScript semantics by invoking `JSON.stringify(value)` with the validated
canonical event as its sole argument: no replacer and no `space` argument.
Wisp SHALL NOT sort keys, pretty-print, or apply another canonicalization
pass. The exact returned string is then encoded as UTF-8. JSON escaping and
property enumeration therefore contribute exactly the bytes emitted by that
one call; the terminating LF is appended afterward and is not part of the
event-size count.

The serialization boundaries use these exact vectors:

| Vector | Required result |
|---|---|
| `Buffer.byteLength(JSON.stringify(value), "utf8") === 32_768` | event-size validation passes; append writes those 32,768 bytes plus one LF |
| `Buffer.byteLength(JSON.stringify(value), "utf8") === 32_769` | reject `invalid_input/event_too_large` with `limit: 32768`, `actual: 32769`, and no bus creation or modification |
| for one operation, observed existing bus bytes plus serialized bytes plus one LF equals `16_777_216` | that operation's projected-bus validation passes |
| for one operation, observed existing bus bytes plus serialized bytes plus one LF equals `16_777_217` | that operation rejects `bus_limit_exceeded` with `subject: "bus"`, `unit: "utf8_bytes"`, `limit: 16777216`, `actual: 16777217`, and does not append its event |

Boundary fixtures SHALL include ASCII, escaped control characters, and
non-ASCII scalar values so UTF-16 string length cannot substitute for the
post-serialization UTF-8 byte count.

Per-operation serialization and projected-size arithmetic use the bytes that
operation observes. The nominal maximum is not an aggregate bound across
concurrent operations.

Explicit `null` and unknown properties are invalid at the event root and in
all defined nested bodies except recursively inside `command.payload`.

| Kind | Required fields beyond `v`, `ts`, `run`, `agent`, `kind` | Optional fields |
|---|---|---|
| `status` | `state` | `activity`, `refs`, `to`, `meta` |
| `heartbeat` | none | `to`, `meta` |
| `verdict` | `verdict` | `activity`, `refs`, `to`, `meta` |
| `question` | `question: {id, text}` | `to`, `meta` |
| `command` | `command: {id, type, target}` | `command.payload`, `to`, `meta` |
| `command_ack` | `ack: {commandId, result}` | `ack.note`, `to`, `meta` |

`to`, `question.id`, `command.id`, `command.target`, `ack.commandId`, and
`meta.via` obey the identifier rule. When present, `meta` is exactly
`{"via": "<identifier>"}`. `question.text`, `activity`, `verdict`,
`refs`, and `ack.note` obey their fixed limits and primitive rules.

`state` is exactly one of `spawned`, `working`, `blocked`,
`awaiting_gate`, `done`, or `failed`. A present `refs` array is non-empty and
contains no more than 32 references. `ack.result` is exactly `accepted`,
`rejected`, or `completed`. `command.type` is exactly `pause`, `resume`,
`abort`, `answer`, `gate`, `steer`, or `dispatch`.

When present, `command.payload` is an object. Its nested property values may
recursively be any JSON value—object, array, string, number, boolean, or
`null`—and its nested objects may have arbitrary property names. It remains
bounded by both the canonical-event and raw-line byte limits. MCP SHALL NOT
create command events.

Command reduction uses physical append order, never timestamps:

1. Use only valid events and select command events whose `run` equals the
   requested run. Invalid lines remain parse errors and never participate in
   reduction.
2. Their result fields are `issued_by = command-event.agent` and
   `issued_at = command-event.ts`; check output preserves command append order.
3. Before reducing state, count command ids. If any id occurs more than once,
   `wisp_check` returns `command_conflict` for the first duplicated id by
   command append order, includes its count, and returns no partial commands or
   parse errors. A requested duplicate is likewise `command_conflict` for
   `wisp_ack`.
4. State reduction applies only to unique command ids. For a unique command,
   consider only valid `command_ack` events later in
   append order whose `run` is the same and whose `ack.commandId` matches.
   Before-command acknowledgements and other-run acknowledgements do not
   apply. The last applicable acknowledgement wins.
5. With no applicable acknowledgement the command status is `pending`;
   otherwise it is the last acknowledgement's `accepted`, `rejected`, or
   `completed` result.

## Exact MCP tool inputs

All seven tools reject unknown properties and `null`. `run`, `agent`, `to`,
`via`, `question_id`, and `command_id` use the identifier rule.

| Tool | Required input properties | Optional input properties and defaults |
|---|---|---|
| `wisp_status` | `run`, `agent`, `state` | `activity`, `refs`, `to`, `via` |
| `wisp_heartbeat` | `run`, `agent` | `to`, `via` |
| `wisp_verdict` | `run`, `agent`, `verdict` | `activity`, `refs`, `to`, `via` |
| `wisp_question` | `run`, `agent`, `question_id`, `text` | `to`, `via` |
| `wisp_check` | `run`, `agent` | none |
| `wisp_ack` | `run`, `agent`, `command_id` | `result` defaults to `accepted`; `note`, `to`, `via` |
| `wisp_dashboard` | none | none |

`state` and `result` use the canonical enums. `verdict` uses the verdict
maximum; `activity`, `note`, `text`, and `refs` use the fixed product
constants. No input includes a timestamp, version, project, root, bus path,
arbitrary metadata, or command payload. `wisp_dashboard` accepts exactly the
empty object `{}` and uses the process's already memoized project resolution.

The four event-reporting tools and `wisp_ack` call the corresponding shared
runtime operation and return the exact event appended. `wisp_check` returns
only pending commands in the requested run whose target equals `agent` or
`*`; it does not execute, interpret, mutate, or acknowledge them.

`wisp_ack` SHALL append only when exactly one command with `command_id` exists
in the requested run, its append-order-reduced status is pending, and its
target equals the acknowledging agent or `*`. Missing, duplicate,
non-pending, and differently targeted commands fail without append.

`wisp_dashboard` delegates to the memoized dashboard coordinator. It does not
accept or infer another project, open a browser, invoke a shell, detach a
process, or append a command.

## Exact MCP outputs and error mapping

Every successful invoked tool and every failure covered by the error contract
below returns one JSON envelope in MCP `structuredContent` and an identical
compact JSON serialization in its sole text content item. That text is exactly
Node 24 `JSON.stringify(envelope)` with the envelope as the sole argument and
no replacer or spacing. A failure originating in the project-bus
`.wisp/write.lock` protocol is excluded from this failure-envelope contract;
stdout framing and capability-safety requirements still apply.

Success:

```json
{"ok":true,"data":{}}
```

Contracted expected failure:

```json
{"ok":false,"error":{"code":"project_unresolved","message":"Human-readable summary","details":{}}}
```

`isError` is `false` for success and `true` for a contracted failure envelope.
Clients SHALL branch on `code`, not `message`, for contracted failures.

Write-tool success data is `{"event": <canonical-event>}`.
`wisp_check` success data is:

```json
{
  "commands": [
    {
      "id": "command-id",
      "type": "pause",
      "target": "agent-or-*",
      "issued_by": "issuer",
      "issued_at": "RFC-3339 timestamp",
      "status": "pending",
      "payload": {}
    }
  ],
  "parse_errors": [
    {"line": 1, "reason": "invalid_json", "raw": "original line"}
  ]
}
```

`payload` is omitted when absent. `commands` preserve bus order;
`parse_errors` preserve line order.

`wisp_dashboard` success data is exactly:

```json
{
  "url": "http://127.0.0.1:49152/#capability=<43-character capability>",
  "reused": false
}
```

`reused` is `false` only for the call that published this owner generation;
it is `true` after an existing compatible owner passed the authenticated
health proof. No other property is returned.

Except for failures originating in the non-contracted project-bus
`.wisp/write.lock` mutual-exclusion and append-ordering protocol, error `code`,
`details.reason`, and `details.field` values are contractual;
human-readable `message` and operating-system exception text are not.
`details.field` is an RFC 6901 JSON Pointer (`""` for the whole input,
`/run`, `/refs/3`, and so on).

Stable `invalid_input` reasons are `required`, `unknown_property`,
`null_not_allowed`, `wrong_type`, `blank`, `control_character`, `too_long`,
`too_many`, `invalid_enum`, `event_too_large`, and `cross_field`.
Stable `project_unresolved` reasons are `invalid_environment_root`,
`roots_unsupported`, `roots_list_failed`, `roots_absent`,
`roots_ambiguous`, and `invalid_file_root`.

For failures not originating in the project-bus `.wisp/write.lock` protocol,
stable bus reasons are `path_is_symlink`, `path_not_directory`,
`path_not_regular_file`, `outside_project`, `stat_failed`, `mkdir_failed`,
`open_failed`, `read_failed`, `append_failed`, and `invalid_utf8`.
`bus_unreadable` uses the applicable reason except `mkdir_failed` and
`append_failed`;
`bus_unwritable` uses the applicable reason except `read_failed` and
`invalid_utf8`. Stable parse-error reasons are `invalid_json` and
`invalid_event`.

No code, reason, retryability, message, operating-system text, or stderr
diagnostic caused by project-bus `.wisp/write.lock` acquisition, ownership,
recovery, release, or cleanup is contractual. This exception does not apply to
the separate dashboard ownership/coordinator errors.

| Error code | Used when | Required `details` |
|---|---|---|
| `invalid_input` | A named tool's arguments violate its schema or cross-field rule | `field`, stable `reason`, and `limit`/`actual` when bounded |
| `project_unresolved` | Project selection fails | `reason` from the resolution contract and `source` (`environment` or `roots`) |
| `bus_unreadable` | The selected bus cannot be safely statted, contained, decoded, or read | `path`, stable `reason` |
| `bus_unwritable` | Non-project-bus-lock directory validation/creation, containment, bus open, or append fails | `path`, stable `reason` |
| `bus_limit_exceeded` | Bus, line, command count, or parse-error count exceeds a fixed maximum | `subject` (`bus`, `line`, `commands`, or `parse_errors`), `unit` (`utf8_bytes` or `items`), `limit`, `actual` |
| `command_not_found` | No matching command exists in the run | `command_id` |
| `command_conflict` | More than one matching command id exists in the run | `command_id`, `count` |
| `command_not_pending` | The unique command is already dispositioned | `command_id`, `status` |
| `command_not_targeted` | The unique pending command targets another agent | `command_id`, `target`, `agent` |
| `dashboard_unavailable` | Dashboard startup, reuse, or safe recovery cannot complete | stable `reason`, `retryable` |
| `dashboard_version_conflict` | A live owner uses another dashboard protocol | `expected_protocol`, `actual_protocol` |
| `internal_error` | An unexpected non-project-bus-lock server defect reaches the adapter | `incident_id` |

Serialized-event excess is `invalid_input` with field `""`, reason
`event_too_large`, `limit`, and `actual`. `command_not_pending.status` is
exactly `accepted`, `rejected`, or `completed`.

Stable non-retryable `dashboard_unavailable` reasons are `runtime_unsafe`,
`project_contains_runtime`, `process_identity_unavailable`,
`owner_identity_unverifiable`, `bind_failed`, and `publish_failed`. Stable
retryable reasons are `owner_starting`, `owner_unhealthy`, and
`ownership_contended`. The contractual `retryable` boolean matches those
sets. `dashboard_version_conflict` requires integer protocol values and
`expected_protocol` is exactly `1`.

Named-tool input failures are mapped into `invalid_input` tool results so
their envelope is stable across host SDKs. Unknown tool names use MCP
`MethodNotFound` (`-32601`). Requests malformed before a named tool can be
identified use MCP `InvalidParams` (`-32602`). MCP framing/internal transport
failures may use their standard JSON-RPC errors; they are not tool results.
An unexpected handler exception that does not originate in the project-bus
`.wisp/write.lock` protocol is caught, diagnosed on stderr, and returned as
`internal_error` without terminating a valid session. Project-bus-lock-origin
exceptions have no contracted envelope, `isError`, `internal_error`, or
diagnostic behavior.

Malformed bus lines are data only on a successful `wisp_check` when all read
limits are satisfied. They are never rewritten or represented as events.

## Stdio and executable contract

`node dist/wisp.mjs` starts the server over stdio and starts no CLI or HTTP
listener before an explicit `wisp_dashboard` call. Stdout contains MCP
protocol frames only, including while the dashboard runs and when a
project-bus-lock-origin failure occurs. Startup text and every diagnostic or
exception detail whose emission is contracted use stderr. The specification
does not require a project-bus-lock-origin diagnostic to be emitted or
constrain its content, but it may not violate stdout framing or
capability-safety.

The source is TypeScript. The distributed artifact is ordinary JavaScript
containing all runtime dependencies, built with esbuild target `node24`, and
compatible with Node 24.x. Plugin installation and invocation SHALL NOT run
lifecycle scripts, access a package registry, invoke `npm`/`npx`, require a
global `wisp`, or resolve project/global packages. Host configs MAY resolve
the host-provided `node` executable from `PATH`. The payload declares no
binary and the bundle has no CLI command dispatcher.

## Plugin, skill, marketplace, and Preview contract

`plugins/wisp/` SHALL contain exactly these eight distributed paths:

- `.claude-plugin/plugin.json`;
- `.codex-plugin/plugin.json`;
- `.mcp.json`;
- `VERSION`;
- `dist/wisp.mjs`;
- `skills/wisp/SKILL.md`;
- `skills/dashboard/SKILL.md`;
- `README.md`.

`VERSION` SHALL contain one canonical SemVer plus one terminal LF and no other
bytes. For the package under this contract it is exactly `0.2.1-rc.4\n`. Its
value SHALL equal:

- both host manifest versions;
- the Codex bootstrap's cache-path version segment;
- root `package.json` and both root-package versions in `package-lock.json`;
- the MCP server identity emitted by `src/mcp.ts`; and
- the package identity projected into the generated `dist/wisp.mjs`; and
- every existing package-version assertion in tests.

`qualification.json` and `surfaces.json` SHALL NOT exist in the distributed
payload. They are not version carriers. No source, build, test, workflow,
release, or documentation path SHALL read, write, mutate, join, validate, or
require either file, an aggregate qualification result, a qualification
digest, a disclosure matrix, a marketplace-observation join, or a
support-like exact-surface row.

The generated `dist/wisp.mjs` bytes SHALL use bundle target `node24` and run
under Node.js 24.x. Node.js 24 is Wisp's sole runtime requirement, CI line,
and bundle target. This technical compatibility boundary SHALL NOT be
described or interpreted as a Supported claim.

The SemVer validator SHALL implement the full SemVer 2.0.0 grammar, including
nonnumeric prerelease identifiers that begin with a digit, and SHALL reject
leading zeroes only for purely numeric identifiers.

Claude `.mcp.json` is exactly one `wisp` stdio-server definition with command
`node`, args `["${CLAUDE_PLUGIN_ROOT}/dist/wisp.mjs"]`, and environment
`WISP_PROJECT_ROOT=${CLAUDE_PROJECT_DIR}`. These are Claude's official plugin
substitutions; the project therefore binds without a roots request.

The Codex `.codex-plugin/plugin.json` contains exactly one inline
`mcpServers.wisp` definition with command `node`, args `["-e",
"<bootstrap>"]`, no `cwd`, and `env_vars: ["CODEX_HOME"]`. The bootstrap:

1. sets `WISP_PROJECT_ROOT=process.cwd()` before importing Wisp;
2. selects Codex home from `CODEX_HOME` or `<user-home>/.codex`;
3. imports
   `<codex-home>/plugins/cache/kodhama/wisp/<plugin-version>/dist/wisp.mjs`
   by file URL; and
4. reports load failure on stderr and sets a failing exit status.

The bootstrap cache version SHALL exactly equal the Codex manifest version.
It SHALL contain no model-supplied path, `cwd` override, network access,
install action, or stdout diagnostic. A custom Codex MCP-config path is
prohibited.

Neither launch invokes `npm`/`npx`, a global `wisp`, or project dependencies.
Resolving `node` from the host's `PATH` is permitted.

The lifecycle skill instructs agents to report actual transitions, heartbeat after
meaningful silence, check at handoff seams, and acknowledge commands they
handled through the MCP tools. It contains no shell syntax, paths, Grove role
names, Grove verdict grammar, command auto-obedience, or consumer truth claim.

The dashboard skill activates only for an explicit request to open, show, or
start the Wisp dashboard. It calls `wisp_dashboard`, presents the exact
returned link, and does not manufacture a URL, invoke a shell, open a browser,
start the legacy server, or add lifecycle policy.

The plugin README SHALL identify Wisp as Preview and state explicitly that
support is not claimed. It SHALL NOT imply that marketplace presence,
successful installation, ordinary CI, deterministic E2E, or live smoke
creates a Supported claim. A Stewards marketplace listing SHALL carry the
same disclosure or link to the distributed README. A later Stewards entry may
point to `kodhama/wisp`, path `plugins/wisp`; Stewards carries neither bundle
bytes nor a Wisp version.

Typecheck, unit, build, host-plugin validation, and deterministic
Docker/Playwright E2E remain ordinary product-quality checks. Their success
does not create an aggregate qualification result, release certificate, or
support promise. Live marketplace smoke remains drift detection under
SPEC-0002 and does not gate package identity or release.

Any future Supported claim SHALL require a new Wisp-local decision that names
the exact host and surface promise, limitations, evidence, and renewal policy.
If Wisp later declares machine-readable exact-surface rows, each row SHALL
follow the Stewards 0023 availability/support grammar received by ADR-0013.

## Acceptance criteria

### Given/When/Then scenarios

**S1 — Zero-configuration single project**

- **Given** a Claude or Codex session opened on one project,
- **When** the host launches Wisp and the first bus or dashboard tool is
  called,
- **Then** it resolves the same real project once and, for bus work, selects
  `<real-project>/.wisp/events.ndjson` without project setup.

**S2 — Clean installation**

- **Given** no global Wisp and no project dependencies,
- **When** Stewards installs the plugin and either host starts a session,
- **Then** the bundled server launches without fetching or installing.

**S3 — Explicit project root**

- **Given** a valid absolute `WISP_PROJECT_ROOT` and any roots response,
- **When** resolution runs,
- **Then** the real environment-root directory is selected and roots are not
  consulted.

**S3a — Codex session bootstrap**

- **Given** Codex launches the installed plugin without an MCP `cwd`,
- **When** the inline bootstrap runs,
- **Then** it binds the host-selected session directory through
  `WISP_PROJECT_ROOT` before importing the version-matched bundle.

**S4 — Invalid explicit root**

- **Given** a present blank, relative, missing, or non-directory
  `WISP_PROJECT_ROOT`,
- **When** a bus tool is called,
- **Then** `project_unresolved/invalid_environment_root` is returned with no
  roots fallback and no bus I/O.

**S5 — Roots capability absent**

- **Given** no explicit root after host adaptation and a client without roots
  capability,
- **When** a bus tool is called,
- **Then** `project_unresolved/roots_unsupported` is returned with no bus I/O.

**S6 — Roots listing failure**

- **Given** no explicit root and a roots request that rejects, fails, or
  exceeds 5,000 ms,
- **When** resolution runs,
- **Then** `project_unresolved/roots_list_failed` is memoized.

**S7 — Root count and URI validation**

- **Given** zero roots, multiple roots, or one invalid/non-local/non-directory
  file root,
- **When** a bus tool is called,
- **Then** the matching stable root reason is returned and no bus is touched.

**S8 — Immutable binding**

- **Given** a process whose resolution succeeded or failed,
- **When** roots later change and another tool is called,
- **Then** the original result remains in force without another roots request.

**S9 — First write**

- **Given** a selected project with no `.wisp` directory,
- **When** a valid write tool succeeds,
- **Then** the directory and bus are created and exactly one bounded NDJSON
  line containing the returned event is appended.

**S10 — Empty read**

- **Given** a selected project with no bus,
- **When** `wisp_check` runs,
- **Then** it returns empty commands and parse errors without creating a file.

**S11 — Exact tool schemas**

- **Given** the initialized server,
- **When** a client inspects input and output schemas,
- **Then** exactly the seven named schemas and the properties, enums, defaults,
  limits, unknown-property rejection, and envelopes in this spec are present.

**S12 — Boundary validation**

- **Given** each string, reference count, event size, bus size, line size, and
  returned-count boundary and, for projected bus size, one operation's
  observed existing bus bytes,
- **When** values at and one unit beyond the boundary are exercised,
- **Then** boundary values succeed and excess values return the specified
  error without partial output or append.

**S13 — Shared runtime and coordinator**

- **Given** each of the six event/check tools and `wisp_dashboard`,
- **When** its handler performs domain work,
- **Then** the event/check handler delegates to the reusable runtime, the
  dashboard handler delegates to the memoized coordinator, and neither
  contains a parallel validation, reduction, or bus implementation.

**S14 — Pending commands and malformed lines**

- **Given** unique-id commands, before- and after-command acknowledgements,
  acknowledgements from other runs, and bounded malformed lines,
- **When** `wisp_check` runs,
- **Then** commands retain append order, `issued_by` and `issued_at` come from
  each command event, only later same-run acknowledgements apply, the last
  applicable acknowledgement wins, and ordered parse errors are returned
  without execution or mutation.

**S15 — Acknowledgement authorization**

- **Given** a missing, duplicate, non-pending, or differently targeted command,
- **When** `wisp_ack` runs,
- **Then** its exact command error is returned and no bytes are appended.

**S16 — Authorized acknowledgement**

- **Given** one pending command addressed to the agent or `*`,
- **When** the agent acknowledges it,
- **Then** one canonical acknowledgement event is appended and returned.

**S17 — Error mapping**

- **Given** each contracted error class excluding project-bus
  `.wisp/write.lock`-origin failures, plus an unknown tool and a pre-tool
  malformed request,
- **When** MCP handles them,
- **Then** named-tool errors use the stable `isError` envelope, the unknown
  tool uses `-32601`, and the malformed request uses `-32602`; a
  project-bus-lock-origin failure has no contracted envelope, `isError`,
  `internal_error`, or diagnostic behavior.

**S18 — Stdout purity**

- **Given** startup, success, contracted expected failures, an unexpected
  non-project-bus-lock handler exception, and a project-bus-lock-origin
  failure,
- **When** the process is exercised over stdio,
- **Then** stdout parses wholly as MCP traffic in every case, contracted
  diagnostics appear only on stderr, and no diagnostic emission or content is
  required for the project-bus-lock-origin failure.

**S19 — Import safety**

- **Given** every reusable module,
- **When** imported without invoking an entrypoint,
- **Then** it parses no arguments, starts no listener, emits no output, and
  performs no bus I/O.

**S20 — Exact plugin payload**

- **Given** the built `plugins/wisp/` directory,
- **When** its distributed payload and executable surfaces are inspected,
- **Then** it contains exactly the eight specified paths, contains neither
  `qualification.json` nor `surfaces.json`, declares no binary
  or CLI dispatcher, Claude launches through root `.mcp.json`, and Codex
  launches through the manifest's inline server definition.

**S21 — Project isolation**

- **Given** two MCP processes rooted in different projects,
- **When** each writes,
- **Then** each event appears only in its selected project bus.

**S22 — Tool boundary**

- **Given** an initialized MCP server,
- **When** tools are listed and unknown handlers are probed,
- **Then** only the seven Wisp tools exist and no MCP command-issuance path is
  reachable; command issuance exists only on the authenticated dashboard HTTP
  route.

**S23 — Skill portability**

- **Given** the packaged lifecycle and dashboard skills,
- **When** their contents are inspected,
- **Then** both delegate mechanics to MCP, the dashboard skill only presents
  the returned URL, and neither contains prohibited host-, shell-, path-,
  Grove-, auto-obedience, URL-invention, or browser-launch policy.

**S24 — Independent host integration**

- **Given** the same built Preview package installed for Claude and Codex,
- **When** each host's ordinary integration smoke runs,
- **Then** each independently proves tool listing, check, write, explicit
  dashboard open, and exact bus path in a single-project fixture without
  creating an aggregate release or support result.

**S25 — Node 24 technical boundary**

- **Given** the build configuration and clean bundled artifact,
- **When** package and runtime checks run,
- **Then** the bundle target is exactly `node24`, the artifact launches and
  passes its contract suite on Node 24 without dependency resolution, and the
  technical Node requirement creates no Supported claim.

**S26 — Filesystem confinement**

- **Given** a canonical project and a pre-existing symlink or wrong-type
  `.wisp`/bus path, or a resolved parent outside that project,
- **When** a read or write tool runs,
- **Then** it returns the specified stable bus error and performs no bus
  content I/O.

**S27 — Deterministic bus decoding**

- **Given** buses containing invalid UTF-8, LF/CRLF records, a final
  unterminated record, an empty line, a whitespace-only line, and malformed
  JSON/event records,
- **When** `wisp_check` reads them,
- **Then** invalid UTF-8 fails the read, valid byte/line boundaries follow the
  exact splitting rules, empty lines are skipped, and malformed records use
  the stable parse reasons.

**S28 — No aggregate qualification lifecycle**

- **Given** a build, test, workflow, release, or documentation path,
- **When** it processes the Preview package,
- **Then** it neither requires nor mutates an aggregate qualification result,
  qualification digest, disclosure matrix, marketplace-observation join, or
  support-like exact-surface row.

**S29 — Duplicate commands fail the complete check**

- **Given** a requested run with one or more duplicated command ids,
- **When** `wisp_check` runs,
- **Then** it returns `command_conflict` for the duplicated id whose first
  command appears earliest, includes that id's total count, and returns no
  commands or parse errors.

**S30 — Stored event validity**

- **Given** boundary cases for version, timestamp form/calendar validity,
  common identifiers, every kind's required/optional fields, unknown fields,
  explicit nulls, and nested command payload JSON,
- **When** the bus is parsed,
- **Then** only events satisfying the complete canonical event contract
  participate in check or acknowledgement reduction and every other nonblank
  line yields `invalid_event`.

**S31 — Explicit lazy startup**

- **Given** a clean user home and a launched Wisp MCP session,
- **When** no `wisp_dashboard` call has occurred,
- **Then** no dashboard runtime path, owner record, capability, or HTTP
  listener exists and ordinary bus tools remain usable.

**S32 — Exact dashboard tool**

- **Given** a resolved project, safe user-runtime ancestors, an available
  loopback listener, and no injected ownership or filesystem failure,
- **When** `wisp_dashboard` receives `{}` or any null/property-bearing input,
- **Then** `{}` returns the exact URL/reused success envelope while every
  other input returns the specified `invalid_input` without dashboard state;
  unmet startup preconditions return the exact dashboard errors specified
  above rather than this success case.

**S33 — User-runtime confinement**

- **Given** safe and unsafe combinations of home/runtime ownership, modes,
  symlinks, types, and a project equal to or containing the runtime root,
- **When** dashboard startup resolves its rendezvous,
- **Then** only the exact safe user-private hierarchy is accepted, unsafe
  state fails with the specified reason and no listener, and
  `project_contains_runtime` does not disable bus tools.

**S34 — Owner-record schema and publication**

- **Given** each valid and one-property-invalid starting and ready record,
- **When** discovery reads or publishes it,
- **Then** only the exact closed discriminated shape is structurally accepted,
  Wisp publishes and reuses only protocol `1`, another positive safe-integer
  protocol reaches version conflict after identity proof, and a ready record
  becomes discoverable only through atomic replacement after the listener is
  live.

**S35 — Same-project convergence**

- **Given** concurrent calls from multiple MCP processes for one OS user and
  canonical project,
- **When** acquisition completes during an owner-stable interval,
- **Then** one owner, listener, instance, capability, and URL exist; the
  publishing call returns `reused: false` and health-proven followers return
  `reused: true`.

**S36 — Owner state refusal**

- **Given** a live owner that is respectively starting beyond the bounded
  wait, ready but unhealthy, shutting down, or protocol-incompatible,
- **When** another process calls `wisp_dashboard`,
- **Then** it returns the exact retryable reason or version-conflict envelope
  and never creates a second listener.

**S37 — Process identity and PID reuse**

- **Given** live provider stability/child/absence evidence plus deterministic
  same-PID adapter observations with recorded token A and current token B,
- **When** recovery evaluates ownership,
- **Then** the evidence is reproducible without forcing OS PID reuse, only
  proved-dead and token-mismatched old records may be quarantined, and
  matching or inconclusive identities are never stolen.

**S38 — Startup fault recovery**

- **Given** injected failure before claim, after claim, after bind, during
  ready publication, and immediately after publication,
- **When** the owner fails and a later explicit call runs,
- **Then** the failed live owner closes its listener and removes or
  quarantines only its matching starting/ready record before returning, no
  bound-but-unpublished listener survives, complete dead-owner state is
  recoverable within bounded convergence, and two live owners never exist.

**S39 — Lifecycle cleanup**

- **Given** an owning MCP process and a non-owning follower,
- **When** stdio closes or the owner receives `SIGINT` or `SIGTERM`,
- **Then** cleanup is idempotent, rejects new authenticated work, drains for
  at most 1,000 ms, forcibly destroys remaining tracked sockets, closes the
  listener, removes only the matching owner record, leaves no daemon, and
  never removes a replacement's record.

**S40 — Capability bootstrap and rotation**

- **Given** a returned capability URL and then a replacement owner,
- **When** the page bootstraps and authenticated calls are attempted with the
  current and stale capabilities,
- **Then** the fragment is removed into closure-only memory, the current
  capability succeeds, the stale capability fails generically, only the
  matching private ready record persists the current capability, and neither
  capability crosses any other persistence, log, diagnostic, health, error,
  evidence, artifact, cache, upload, bus, or analytics sink.

**S41 — HTTP boundary**

- **Given** every exact route plus missing/duplicated/wrong authorization,
  hostile Host/Origin, query strings, wrong methods/content types, oversized
  headers/bodies, header/body deadline expiry, idle sockets, shutdown, and
  external-resource attempts,
- **When** the HTTP surface handles them,
- **Then** it applies the exact first-failure precedence, allowed requests
  receive the specified status/envelope and security headers, rejected
  requests receive the exact condition-to-status/code mapping, sockets close
  within their deadlines, and there is no permissive CORS, secret disclosure,
  or rejected-request bus write.

**S42 — Authenticated event read**

- **Given** bounded buses containing valid events, malformed lines, reduced
  commands, and a duplicate command id,
- **When** authenticated `GET /api/events` runs,
- **Then** it returns all valid events and parse errors in physical order plus
  all server-reduced command states through the canonical reader/reducer
  without truncation, mutation, or browser-side command reduction, while the
  duplicate case returns HTTP `409` with the exact `command_conflict` Wisp
  envelope and no partial data.

**S43 — Authenticated command append**

- **Given** exact and invalid dashboard command bodies,
- **When** authenticated same-origin `POST /api/commands` runs,
- **Then** each valid body appends and returns exactly one canonical
  `maintainer` command through the shared canonical bus-append path, every
  invalid body appends zero bytes, and no command is executed or acknowledged.

**S44 — Project-key isolation**

- **Given** two canonical projects with the same basename and sessions from
  both hosts,
- **When** each explicitly opens and uses its dashboard,
- **Then** the SHA-256 keys, owners, listeners, event reads, and command
  appends remain isolated to their respective project buses.

**S45 — Cross-host singleton behavior**

- **Given** Claude Code and Codex installed from the same package and opened
  on one project,
- **When** both explicitly request the dashboard concurrently,
- **Then** direct integration evidence proves one returned URL, both host
  opens, cross-host singleton behavior, identity, security, commands,
  cleanup, recovery, and project isolation.

**S46 — No legacy or detached surface**

- **Given** the source graph and built plugin,
- **When** imports, processes, listeners, paths, and executable declarations
  are inspected,
- **Then** there is no CLI, daemon, detached child, browser/shell launch,
  remote transport, external dashboard resource, or legacy `.grove` data
  path, and only explicit dashboard invocation can start HTTP.

**S47 — Preview project-bus lock boundary**

- **Given** same-process or cross-process bus operations and any current
  `.wisp/write.lock` state, interleaving, failure, or delay,
- **When** MCP or dashboard writers append to the project bus,
- **Then** Wisp Preview makes no guarantee for that project-bus
  mutual-exclusion and append-ordering protocol's concurrency, ownership,
  recovery, cleanup, path identity, deadlines, timing, error mapping, or
  diagnostics; issue #50 remains the sole venue for a positive project-bus
  lock-correctness contract; and the separate ADR-0005 user-runtime dashboard
  ownership/coordinator contract remains current.

**S48 — Safe functional dashboard UI**

- **Given** lifecycle events, commands in every disposition, malformed lines,
  hostile text payloads, refresh failures, and all seven command controls,
- **When** the embedded page loads, refreshes, renders, and submits,
- **Then** it follows the exact immediate/2,000 ms visibility-aware refresh
  policy, groups by first-seen run and agent, applies append-order
  last-seen/status/activity-clear/verdict projection, renders
  lifecycle/events/parse errors/server-reduced commands as text, submits only
  explicit user actions, and interprets no bus or error value as markup,
  script, style, attribute, or URL.

**S49 — Post-acquisition recheck**

- **Given** a contender that atomically promoted its starting candidate and
  an owner record that is unchanged, changed, missing, reusable,
  incompatible, or unsafe at the post-acquisition seam,
- **When** it performs the mandatory recheck before bind,
- **Then** only its unchanged authoritative starting instance may bind and
  every other case follows the ordinary reuse or stable failure path without
  a second listener.

**S50 — Dashboard-first project resolution**

- **Given** no prior Wisp tool call and each successful and failing project
  resolution vector,
- **When** `wisp_dashboard` is the first tool invoked,
- **Then** project resolution runs and memoizes before user-runtime or network
  work, success keys the resolved canonical project, and failure creates no
  dashboard state or listener.

**S51 — Append commit has a per-operation meaning**

- **Given** one append that completes the full compact event-plus-LF write and
  any overlapping same-process or cross-process project-bus lock activity,
- **When** that operation reaches its append commit point,
- **Then** commit establishes only that the complete write occurred for that
  operation; it creates no guarantee that the bytes will later be preserved
  or remain durable under overlap.

**S52 — Exact qualified process providers**

- **Given** every Linux and macOS parser fixture, live current/child/exit
  observations, deterministic same-PID/new-birth tokens, and Windows,
- **When** the shared identity provider is qualified,
- **Then** only exact Linux boot-id/start-ticks and macOS absolute-`/bin/ps`
  C-locale tokens qualify for dashboard ownership, Windows remains
  unsupported, and no PID-only result is accepted; these provider guarantees
  create no project-bus `.wisp/write.lock` mutual-exclusion or append-ordering
  guarantee and do not weaken the separate dashboard ownership contract.

**S53 — HTTP deadline boundaries**

- **Given** headers ending at and after 5,000 ms and 16,384 bytes, bodies
  completing at and after 5,000 ms and 32,768 bytes, responses completing at
  and after 10,000 ms, idle keep-alive sockets at and after 5,000 ms, and
  shutdown with active sockets at and after 1,000 ms,
- **When** the loopback server accounts from the specified acceptance,
  `CRLFCRLF`, body-completion, response-completion, idle, and cleanup points,
- **Then** boundary-compliant traffic succeeds, the first exceeded deadline
  receives the specified error or socket destruction, and shutdown forcibly
  closes all remaining tracked sockets.

**S64 — Retained host and browser evidence contains no dashboard capability**

- **Given** a host smoke, canary, or browser harness that has received
  a live dashboard fragment and used it as a bearer in volatile memory,
- **When** the harness prepares any transcript or evidence for persistence or
  upload,
- **Then** every fragment-form and bearer-form capability is replaced by a
  non-secret structural sentinel before the first write, the observed
  capability and every capability-shaped form are absent from retained bytes
  and logs, browser failure writers cannot persist raw trace/video/screenshot/
  console/network/reporter data, and a failed redaction check blocks
  persistence and upload.

**S65 — One independent package identity**

- **Given** the `0.2.1-rc.4` package and its retained repository carriers,
- **When** package validation reads `VERSION`,
- **Then** `VERSION` is canonical SemVer `0.2.1-rc.4` plus LF and every
  manifest, cache-path, root package, lock, MCP server, and generated-bundle
  carrier and existing test assertion equals that value, while retired
  aggregate metadata is not a carrier.

**S66 — Preview disclosure is explicit**

- **Given** the distributed README or a Stewards marketplace listing,
- **When** a user evaluates Wisp's adoption posture,
- **Then** the package is identified as Preview, support is explicitly not
  claimed, and the listing either repeats that disclosure or links to it.

**S67 — Quality evidence is not support**

- **Given** marketplace presence, successful installation, ordinary CI,
  deterministic E2E, or a live smoke result,
- **When** package posture is derived,
- **Then** none of those facts creates an aggregate qualification, release
  certificate, or Supported claim.

**S68 — Retired metadata has no consumer**

- **Given** the source, build, test, workflow, release, and documentation
  graphs,
- **When** references to retired qualification and surface metadata are
  inspected,
- **Then** no path reads, writes, requires, mutates, joins, or validates
  `qualification.json` or `surfaces.json`.

**S69 — Future support is claim-scoped**

- **Given** a future exact host or surface support proposal,
- **When** Wisp would make a Supported claim or declare machine-readable
  exact-surface rows,
- **Then** a new Wisp-local decision defines the promise, limitations,
  evidence, and renewal policy, and every declared row follows the Stewards
  0023 availability/support grammar.

**S70 — Project-bus lock recovery is not contracted**

- **Given** any complete, malformed, missing, replaced, or concurrently
  changed `.wisp/write.lock` state,
- **When** current project-bus lock recovery runs,
- **Then** Wisp Preview promises no owner interpretation, identity use,
  recovery eligibility, mutation, error, timing, or cleanup result for that
  protocol; issue #50 solely owns a future positive recovery contract, and
  ADR-0005 dashboard recovery remains separately contracted.

**S71 — Invalid dashboard owners fail closed**

- **Given** every `starting` and `ready` owner-schema violation, including
  invalid owners whose PID, qualified identity, instance, project, protocol,
  port, or capability is individually usable,
- **When** dashboard discovery reads the owner,
- **Then** it returns
  `dashboard_unavailable/owner_identity_unverifiable` with `retryable: false`,
  performs no process observation or health request, and neither quarantines
  nor replaces the owner.

**S72 — Capability locations are sink-bounded**

- **Given** a live dashboard capability in the private ready record and each
  permitted transient location and mandated response transport,
- **When** the owner, browser, HTTP transport, or test harness uses it,
- **Then** only the private ready record persists it, transient copies remain
  in memory, the exact `wisp_dashboard` MCP response, or loopback
  request/response transport, and no other Wisp-controlled output, query, log,
  error, transcript, evidence, file, cache, artifact, upload, bus, or
  analytics sink receives it.

**S73 — Compact serialization has exact byte boundaries**

- **Given** validated canonical events whose one-argument Node 24
  `JSON.stringify` outputs encode to exactly 32,768 and 32,769 UTF-8 bytes,
  plus one operation's observed existing bus bytes producing projections of
  exactly 16,777,216 and 16,777,217 bytes,
- **When** event-size and projected-bus validation run,
- **Then** the two exact-limit vectors pass, the two limit-plus-one vectors
  fail with the specified `actual` and `limit` values without modifying the
  bus, and accepted storage is the unchanged JSON string followed by one LF.

**S74 — Retained data boundary under overlap**

- **Given** validated events and same-process or cross-process bus operations
  that may overlap,
- **When** each operation validates, serializes, accounts for, and attempts
  its append,
- **Then** event schema, validation, exact serialization, project confinement,
  and that operation's byte accounting remain contracted, while project-bus
  `.wisp/write.lock` mutual exclusion and append ordering, later preservation
  or durability of committed bytes, and an aggregate concurrent bus-size
  bound are not guaranteed; the separate dashboard ownership/coordinator
  contract remains current.

### EARS requirements

- **R1 (ubiquitous):** Wisp shall own the complete payload; any later Stewards
  catalog entry shall remain a thin pointer with no bundle or Wisp version.
- **R2 (ubiquitous):** Claude and Codex manifests shall derive one semantic
  plugin version from `VERSION` and launch one bundled executable.
- **R3 (ubiquitous):** Installation and startup shall require no global Wisp,
  daemon, lifecycle script, package-registry access, or project dependency.
- **R4 (event-driven):** When Claude or Codex starts Wisp for one active
  project, the host adapter shall bind its real directory with no Wisp project
  configuration.
- **R5 (optional):** Where `WISP_PROJECT_ROOT` is present, Wisp shall validate
  and select it before roots.
- **R6 (unwanted behavior):** If an explicit root is invalid, Wisp shall fail
  without roots fallback or bus I/O.
- **R7 (unwanted behavior):** If roots are unsupported, fail, time out, are
  absent, ambiguous, or invalid, Wisp shall return the specified
  `project_unresolved` reason without bus I/O.
- **R8 (state-driven):** While an MCP process lives, its first resolution
  result shall remain immutable.
- **R9 (ubiquitous):** The generic resolver's cwd, `GROVE_EVENTS`, and tool
  arguments shall not select a project or bus; only the Codex bootstrap may
  copy its host-selected launch cwd into `WISP_PROJECT_ROOT` before import.
- **R10 (event-driven):** When a missing bus is read, Wisp shall return empty
  data and create nothing.
- **R11 (event-driven):** When the first valid write occurs, Wisp shall create
  `.wisp` and append one compact newline-terminated event.
- **R12 (unwanted behavior):** If any fixed size or count is exceeded, Wisp
  shall return `bus_limit_exceeded` or `invalid_input` without truncation or
  partial append.
- **R13 (ubiquitous):** The MCP server shall expose exactly the seven
  specified tools and no MCP command-issuance capability.
- **R14 (ubiquitous):** Every input shall reject `null`, unknown properties,
  and values outside the exact primitive and tool schemas.
- **R15 (event-driven):** When a write succeeds, Wisp shall return the exact
  canonical event appended.
- **R16 (event-driven):** When check succeeds, Wisp shall return ordered
  pending commands and ordered malformed-line records.
- **R17 (ubiquitous):** Wisp shall never execute, auto-acknowledge, or treat a
  command as authority.
- **R18 (unwanted behavior):** If acknowledgement authorization fails, Wisp
  shall return the exact command error without append.
- **R19 (event-driven):** When a named tool fails for a contracted reason that
  does not originate in the project-bus `.wisp/write.lock` protocol, it shall
  return the stable error envelope with `isError: true`; a
  project-bus-lock-origin failure shall have no contracted envelope,
  `isError`, `internal_error`, or diagnostic behavior.
- **R20 (unwanted behavior):** If a tool is unknown or a request is malformed
  before tool identification, MCP shall use `-32601` or `-32602`
  respectively.
- **R21 (state-driven):** While in MCP mode, stdout shall contain MCP protocol
  traffic only for every outcome, including project-bus-lock-origin failures;
  diagnostics whose emission is contracted shall use stderr, while no
  emission or content shall be required for a project-bus-lock-origin
  diagnostic.
- **R22 (event-driven):** When a reusable module is imported, it shall perform
  no entrypoint or I/O side effect.
- **R23 (ubiquitous):** The six event/check MCP handlers shall call the shared
  runtime operations and constants, and `wisp_dashboard` shall call the
  memoized dashboard coordinator.
- **R24 (ubiquitous):** The plugin bundle shall expose no CLI entrypoint,
  binary declaration, or CLI command dispatch.
- **R25 (ubiquitous):** The plugin payload shall contain exactly the eight
  specified distributed paths, with Claude's server in root `.mcp.json`,
  Codex's server inline in its manifest, and neither retired metadata file.
- **R26 (ubiquitous):** The lifecycle and dashboard skills shall contain
  portable policy only and shall delegate mechanics to MCP.
- **R27 (ubiquitous):** Multiple project processes shall not share a default
  bus or machine-wide daemon.
- **R28 (ubiquitous):** The distributed bundle shall target `node24` and pass
  clean-bundle tests under Node 24 without turning that technical requirement
  into a Supported claim.
- **R29 (ubiquitous):** Ordinary product checks shall independently exercise
  Claude Code and Codex manifest, install, launch, tool-list, check, write,
  explicit-dashboard-open, and exact-bus-path behavior without producing an
  aggregate qualification or release certificate.
- **R30 (unwanted behavior):** No build, test, workflow, release, or
  documentation path shall create or mutate a checked-in aggregate
  qualification record.
- **R31 (unwanted behavior):** If `.wisp` or the bus is a symlink, has the
  wrong type, or resolves outside the canonical project, Wisp shall return the
  stable bus error without bus content I/O.
- **R32 (event-driven):** When Wisp reads a bus, it shall use fatal UTF-8
  decoding and the exact LF, CR, final-segment, blank-line, byte-counting, and
  parse-reason rules.
- **R33 (event-driven):** When commands are reduced, Wisp shall preserve
  command append order, reduce only unique ids, and apply only later same-run
  acknowledgements, with the last applicable acknowledgement winning.
- **R34 (ubiquitous):** `qualification.json` and `surfaces.json` shall be
  absent from the distributed payload and shall not participate in package
  identity, validation, quality checks, release, or documentation.
- **R35 (unwanted behavior):** If a requested run contains duplicate command
  ids, `wisp_check` shall return `command_conflict` for the first duplicated
  id in append order with its count and no partial data.
- **R36 (ubiquitous):** Every stored event shall satisfy the complete
  canonical version, timestamp, identifier, kind, field, null, unknown-field,
  nested-body, payload, and size contract before participating in reduction.
- **R37 (ubiquitous):** Codex shall omit MCP `cwd`, bind the host-selected
  session directory before import, resolve the bundle from the version-matched
  `kodhama/wisp` Codex cache entry, and accept no model-supplied project path.
- **R38 (event-driven):** When Wisp starts or imports without an explicit
  `wisp_dashboard` call, it shall create no dashboard state, capability, or
  listener.
- **R39 (ubiquitous):** Dashboard discovery shall use only the canonical
  user-home runtime root, exact project-key digest, user-private filesystem
  boundary, and exact starting/ready owner-record schemas.
- **R40 (unwanted behavior):** If the project equals or contains the runtime
  root, Wisp shall return `project_contains_runtime` without disabling bus
  tools or choosing another rendezvous.
- **R41 (ubiquitous):** Ownership acquisition and ready publication shall use
  the exact private-candidate and atomic-rename protocol and shall never expose
  an owner directory without complete process evidence.
- **R42 (state-driven):** While a compatible ready owner passes the exact
  authenticated health proof, all same-user same-project callers shall reuse
  its URL and shall not bind another listener.
- **R43 (unwanted behavior):** If an owner is live-starting, live-unhealthy,
  shutting down, protocol-incompatible, or identity-inconclusive, Wisp shall
  return the specified stable error and never steal ownership.
- **R44 (event-driven):** When qualified process evidence proves owner death
  or PID reuse, a contender shall reread the instance, atomically quarantine
  it, and restart acquisition.
- **R45 (unwanted behavior):** If listener bind or ready publication fails,
  Wisp shall close any bound listener and remove or quarantine only its exact
  matching starting/ready record before returning the stable failure.
- **R46 (ubiquitous):** The dashboard listener shall bind only
  `127.0.0.1` on an OS-assigned port and expose only the four exact routes.
- **R47 (ubiquitous):** Every dashboard response shall enforce the specified
  validation precedence, Host, Origin, bearer, CSP, no-store, no-sniff,
  referrer, content-type, deadline, header/body-limit, and exact
  condition-to-status/code contract and shall emit no permissive CORS.
- **R48 (event-driven):** When the dashboard bootstraps from a returned URL,
  it shall remove the fragment immediately, keep the capability only in
  memory, and authenticate API calls through the bearer header.
- **R49 (ubiquitous):** The private ready record shall be the only
  Wisp-controlled persistent location for capability material;
  owning-process memory, the returned URL, page memory, loopback Authorization
  transport, and volatile harness memory may hold transient copies, which
  shall never cross any other Wisp-controlled persistence, query, log,
  diagnostic, error, evidence, cache, artifact, upload, bus, health, or
  analytics sink.
- **R50 (event-driven):** When authenticated events are requested, Wisp shall
  return all valid events, malformed-line evidence, and all command states
  through the shared bounded bus reader and command reducer in physical
  order.
- **R51 (event-driven):** When an exact authenticated same-origin command is
  submitted, Wisp shall create one canonical `maintainer` command and append
  it through the shared canonical project-bus operation.
- **R52 (unwanted behavior):** If an HTTP or command request is unauthorized,
  malformed, oversized, wrong-origin, wrong-host, or wrong-content-type, Wisp
  shall return the exact stable HTTP failure and append nothing.
- **R53 (state-driven):** While dashboard cleanup runs after stdio close,
  `SIGINT`, or `SIGTERM`, it shall reject new authenticated work, drain for at
  most 1,000 ms, destroy remaining tracked sockets, close the listener, remove
  only its matching owner record, install no supervisor, and keep no MCP
  process alive.
- **R54 (ubiquitous):** Different canonical projects shall have different
  singleton domains and shall never share event reads, command writes,
  capabilities, owners, or listeners.
- **R55 (ubiquitous):** The dashboard skill shall call `wisp_dashboard` only
  on explicit open/show/start intent and shall present the exact returned URL
  without inventing transport mechanics or launching a browser or shell.
- **R56 (ubiquitous):** The built plugin shall contain no CLI, daemon,
  detached child, remote transport, external dashboard runtime resource, or
  legacy `.grove` dashboard data path.
- **R57 (ubiquitous):** Direct integration tests shall independently open the
  dashboard in Claude Code and Codex and jointly prove cross-host singleton,
  project isolation, command append, security, cleanup/recovery, and qualified
  process identity.
- **R58 (ubiquitous):** Wisp Preview shall make no guarantee for the current
  project-bus `.wisp/write.lock` mutual-exclusion and append-ordering
  protocol's concurrency, ownership, recovery, cleanup, path identity,
  deadlines, timing, error mapping, or diagnostics, whether bus operations
  are same-process or cross-process; ADR-0005's separate user-runtime
  dashboard ownership/coordinator contract shall remain current.
- **R59 (event-driven):** When a dashboard contender acquires ownership, it
  shall recheck authoritative owner, project, protocol, and process identity
  after acquisition and before listener bind.
- **R60 (unwanted behavior):** If a live dashboard owner fails before success,
  it shall close every listener and remove or quarantine only its matching
  starting/ready record before returning.
- **R61 (ubiquitous):** The HTTP server shall enforce fixed header, body,
  idle, and shutdown deadlines, track every socket, and forcibly destroy
  undrained sockets after the shutdown grace.
- **R62 (ubiquitous):** The embedded UI shall meet the exact refresh,
  lifecycle/event/parse-error/command rendering, explicit command-control,
  in-flight, failure, and text-only insertion behavior.
- **R63 (ubiquitous):** Dashboard qualified-process-identity tests shall
  combine live provider stability/child/absence evidence with a deterministic
  injected same-PID/new-token dashboard-recovery test and shall not require
  forced OS PID reuse.
- **R64 (event-driven):** When `wisp_dashboard` is the process's first tool,
  Wisp shall resolve and memoize the canonical project before user-runtime,
  discovery, or listener work.
- **R65 (ubiquitous):** Dashboard command-state output shall use the same
  reducer and duplicate/acknowledgement semantics as `wisp_check`; neither the
  HTTP adapter nor browser shall implement a second reduction.
- **R66 (state-driven):** Once one operation completes the full compact
  event-plus-LF write, its append commit point shall mean only that the full
  write occurred; it shall not guarantee later preservation or durability of
  those bytes when bus operations overlap through the project-bus lock.
- **R67 (ubiquitous):** No acquisition, release, recovery, cleanup, retry,
  deadline, timer, error, or diagnostic behavior of the current project-bus
  `.wisp/write.lock` protocol shall be normative under this specification.
- **R68 (ubiquitous):** No current bus-lock owner schema, owner identity,
  phase, liveness interpretation, or recovery authorization shall be
  normative for the project-bus `.wisp/write.lock` protocol under this
  specification.
- **R69 (ubiquitous):** Qualified process identity shall use exactly Linux
  boot ID plus `/proc` start ticks or macOS absolute `/bin/ps` start time under
  C locale for dashboard ownership; Windows and unspecified platforms shall
  remain unsupported, and this provider contract shall create no project-bus
  lock guarantee.
- **R70 (unwanted behavior):** If `/api/events` encounters a duplicate command
  id, it shall return HTTP `409` with the exact existing `command_conflict`
  Wisp envelope and no partial data.
- **R71 (ubiquitous):** HTTP timing shall use the exact socket-acceptance,
  `CRLFCRLF`, header-byte, body-completion, response-completion, idle, and
  shutdown accounting boundaries and first-expiry behavior.
- **R72 (event-driven):** When the UI projects events, it shall group by
  first-seen run then agent, use append-order last event for `last_seen`, last
  status for state and activity-with-absence-clearing, last verdict for
  verdict, and render reduced command states and parse errors as safe text.
- **R73 (ubiquitous):** `VERSION` shall be the sole Wisp package SemVer
  authority, contain exactly canonical SemVer `0.2.1-rc.4` plus LF, and equal
  every named manifest, cache-path, root-package, lock, MCP-server,
  generated-bundle, and test assertion carrier; retired aggregate metadata
  shall not be a carrier.
- **R74 (ubiquitous):** The distributed package shall contain exactly the
  eight named paths and neither `qualification.json` nor `surfaces.json`.
- **R75 (unwanted behavior):** If any source, build, test, workflow, release,
  or documentation path reads, writes, requires, mutates, joins, or validates
  retired qualification or surface metadata, static verification shall fail.
- **R76 (ubiquitous):** Wisp package documentation shall identify the package
  as Preview and explicitly state that support is not claimed; a Stewards
  listing shall repeat that disclosure or link to it.
- **R77 (state-driven):** While Wisp makes no claim-scoped Supported promise,
  marketplace presence, successful installation, ordinary CI, deterministic
  E2E, and live smoke shall not be interpreted as support; a future claim
  requires a new Wisp-local decision and future exact-surface rows shall
  follow the Stewards 0023 availability/support grammar.
- **R87 (event-driven):** When host smoke, canary, or browser evidence
  is retained, the harness shall use dashboard capability material only in
  volatile memory, disable or pre-sink sanitize every browser failure writer,
  redact fragment, bearer, and raw observed forms before the first persistent
  write, verify that no observed or capability-shaped value remains, and
  block persistence and upload on failure while preserving only non-secret
  typed structural evidence.
- **R88 (ubiquitous):** No current project-bus `.wisp/write.lock` recovery
  snapshot, malformed-owner salvage, identity observation, reread, mutation,
  or failure behavior shall be normative under this specification; this does
  not alter the separate dashboard recovery contract.
- **R89 (unwanted behavior):** If a dashboard owner fails any property of the
  complete `starting` or `ready` schema, discovery shall return
  `dashboard_unavailable/owner_identity_unverifiable` without using partial
  fields, observing its PID, performing health proof, quarantining, or
  acquiring ownership.
- **R90 (ubiquitous):** Compact event serialization shall be exactly Node 24
  `JSON.stringify(value)` with one argument and no replacer or spacing,
  followed by UTF-8 encoding; per-operation size accounting shall exclude only
  the appended LF from the event-size count and shall accept or reject that
  operation's exact event and projected bus sizes from the bytes it observes;
  no aggregate bus-size guarantee shall apply across concurrent operations.
- **R91 (unwanted behavior):** If capability material leaves permitted
  transient memory, it may cross only the mandated `wisp_dashboard` MCP
  response and loopback request/response transport; it shall cross no other
  Wisp-controlled output, log, error, or evidence sink, the private ready
  record shall remain its sole persistent location, and evidence retention
  shall sanitize and scan fail-closed.
- **R92 (ubiquitous):** The negative project-bus `.wisp/write.lock`
  mutual-exclusion and append-ordering boundary shall apply equally to
  same-process and cross-process bus operations and shall not imply a safe
  case from any observed owner, path, timing, or absence of known contention;
  it shall not apply to ADR-0005's user-runtime dashboard
  ownership/coordinator contract.
- **R93 (ubiquitous):** Event schema, validation, exact serialization, project
  confinement, and per-operation byte accounting shall remain contracted
  independently of the negative lock boundary.
- **R94 (ubiquitous):** Issue #50 shall be the sole venue for project-bus
  `.wisp/write.lock` correctness, research, decision, implementation,
  migration, and positive guarantees; ADR-0017 shall add no further runtime
  lock change; and PR #49 shall retain its already present bounded runtime,
  owner-validation, append, and canary repairs without redesigning the
  project-bus lock or claiming its correctness.

## Verification matrix

| Contract area | Minimum evidence |
|---|---|
| Constants and schemas | Generated-schema snapshot plus table-driven at-limit/over-limit tests for every fixed value, all seven tools, both owner-record variants, all six stored-event kinds, exact timestamp/version, null/unknown rejection, and recursively arbitrary command-payload JSON |
| Resolution | Table-driven tests for environment root, capability absence, list failure/timeout, counts, URI validity, realpath, no-I/O, memoization, and dashboard-as-first-tool success/failure ordering; Codex host smoke verifies session-cwd binding |
| Filesystem | Temp-project tests for missing read, first-write creation, lstat/symlink/type/containment rejection, one-line append, fatal UTF-8, LF/CR/final-segment/blank handling, limits, and no truncation |
| Preview project-bus lock boundary | Contract scans prove no current project-bus `.wisp/write.lock` mutual-exclusion, append-ordering, ownership, recovery, cleanup, path-identity, deadline, timing, error, or diagnostic mechanic is normative for same-process or cross-process bus operations; append fixtures prove only that the commit point completes one full event-plus-LF write, without treating later preservation or durability as acceptance; characterization tests may observe the implementation but create no product guarantee; issue #50 is the sole positive project-bus lock-correctness venue; dashboard tests remain governed by the separate ADR-0005 ownership/coordinator contract |
| Dashboard discovery | Fake-home and process-identity adapters prove exact root/key derivation, ownership/mode/type/symlink rejection, project-ancestor rejection, candidate promotion, mandatory post-acquisition recheck, authenticated reuse, bounded starting wait, live-owner refusal, deterministic same-PID/new-token recovery, contention, and distinct-project isolation; a property-by-property invalid-owner table, including otherwise usable PID/identity/instance/capability and invalid protocol fields, proves exact `owner_identity_unverifiable`, zero provider/health calls, and no quarantine or replacement, while a complete owner with another positive integer protocol reaches `dashboard_version_conflict` only after identity proof |
| Process identity | Linux fixtures prove boot-ID and `/proc/<pid>/stat` field-22 parsing including hostile `comm`; macOS fixtures prove absolute `/bin/ps` C-locale parsing and failures; live current/child/exit observations plus deterministic same-PID/new-birth-token adapters exercise dashboard ownership and recovery only; Windows is rejected, and no result is treated as a bus-lock guarantee |
| Dashboard faults/lifecycle | Fault injection before claim and after claim/bind/publish/completion plus stdio close, `SIGINT`, and `SIGTERM` proves failed-live-owner listener/record cleanup, no bound-unpublished survivor, dead-owner recovery, 1,000 ms bounded drain, forced tracked-socket destruction, matching-instance cleanup, and no daemon |
| Dashboard HTTP/UI | Loopback and browser-DOM tests snapshot exact HTTP-protocol and non-project-bus-lock runtime precedence, condition/status/code mapping including `command_conflict`→`409`, routes/envelopes/headers, acceptance-to-`CRLFCRLF` header bytes/deadline, header-to-body-complete deadline, acceptance-to-response-complete total deadline, keep-alive idle and cleanup-to-forced-close boundaries, bearer, Host, Origin, query, method, content type, body, CSP, capability-bootstrap/rotation/redaction, refresh/visibility/in-flight behavior, exact run/agent append-order projection, text-only rendering, event/parse-error/command-state views, explicit command controls, and zero-write failures; project-bus-lock-origin failures retain only the independent capability-safety constraints |
| Capability-safe host evidence | Host-smoke, canary, and Playwright-failure fixtures prove the exact capability URL is allowed in the mandated `wisp_dashboard` MCP response and its loopback request/response transport, place the live capability in every other permitted transient location and prohibited query, bus, cookie/storage, error-object, log, reporter, screenshot, video, trace, attachment, cache, artifact, and upload sink, prove the private ready record is its sole persistent location, intercept every other Wisp-controlled output before a sink, require exact structural sentinels and typed fields, absence-scan retained evidence/logs, and prove a failed scan produces no persisted or uploaded artifact |
| Compact serialization | Node 24 fixtures invoke one-argument `JSON.stringify(value)` with no replacer/spacing, compare exact UTF-8 bytes and property/escape output, cover ASCII, control escapes, and non-ASCII scalars, accept event size 32,768 and one operation's observed projection of 16,777,216, reject 32,769 and that operation's observed projection of 16,777,217 with exact diagnostics, and prove the accepted event is followed by exactly one LF; no fixture result is represented as a concurrent aggregate bus-size guarantee |
| Runtime boundary | Spies or dependency injection prove all six event/check MCP handlers call shared operations, `wisp_dashboard` calls the memoized coordinator, HTTP reads/writes reuse the canonical runtime, and HTTP/browser contain no second command reducer |
| Command safety | Append-order tests prove issued fields, whole-check first-duplicate conflict/count/no-partial-data, ack duplicate conflict, unique-id-only reduction, same-run/following-ack filtering, last-ack wins, stable ordering, all-status dashboard projection, no execution, and every acknowledgement result |
| Errors | Contract snapshots for non-project-bus-lock MCP and HTTP code/reason/JSON-pointer/detail shapes, retryability, parse reasons, `isError`, `-32601`, `-32602`, dashboard version conflict, HTTP `409` command conflict, and unexpected-exception containment; structural checks prove project-bus `.wisp/write.lock`-originated errors and diagnostics are outside the contract while dashboard ownership/coordinator errors remain contracted |
| Stdio | Spawned-process transcripts prove stdout is MCP framing only for every outcome, including project-bus-lock-origin failures; each diagnostic whose emission is contracted is observed on stderr and never stdout, while lock-origin failures have no diagnostic-emission or content oracle beyond stdout framing and capability safety |
| Import safety | Isolated import probes for every reusable module prove no bus or dashboard state and no listener before explicit invocation |
| Bundle | Build inspection proves target `node24`; a clean fixture with no global Wisp or dependency tree launches the exact distributed artifact under Node 24; documentation and fixtures prove that this technical boundary creates no Supported claim |
| Claude | Validate exact `.mcp.json`; installed current-stable smoke lists seven tools, checks, writes, explicitly opens the dashboard, and verifies fixture `.wisp/events.ndjson` |
| Codex | Separately validate the manifest's one inline bootstrap, absent `cwd`, forwarded `CODEX_HOME`, exact marketplace/plugin/version cache path, and absence of a custom config path; install through marketplace `kodhama`, then smoke lists seven tools, checks, writes, explicitly opens the dashboard, and verifies fixture `.wisp/events.ndjson` |
| Cross-host dashboard | Concurrent installed Claude and Codex sessions on one fixture return one URL; a second fixture remains isolated; direct assertions cover command, security, lifecycle/recovery, live provider stability/child/absence evidence, and deterministic same-PID/new-token recovery |
| Ordinary quality gates | Workflow and script inspection proves typecheck, unit, build, host-plugin validation, and deterministic Docker/Playwright E2E remain active without producing or consuming an aggregate qualification result |
| Plugin contents | Exact eight-path inventory; strict `VERSION` SemVer `0.2.1-rc.4` and retained-carrier parity; absence of `qualification.json` and `surfaces.json`; whole-repository reference scans for retired schemas, joins, transitions, digests, disclosures, and release gates; no CLI/binary/daemon/legacy dashboard path; two portable-skill static checks; and exact Preview/no-support README text |
| Preview posture | README and marketplace-listing fixtures prove explicit Preview/no-support disclosure; checks prove installation, CI, E2E, and live smoke do not create a Supported claim; future-claim documentation requires a new Wisp-local decision and preserves the Stewards 0023 grammar for any future exact-surface row |

## Rubric check

The configured `SPEC_RUBRIC_PATH` says no dedicated rubric exists, so this
check uses `specs/README.md`.

- **Frontmatter:** PASS — all required fields are present; `version: 15`
  records the significant ADR-0017 behavioral amendment, `implements` names
  ADR-0017, superseded ADR-0016 is absent from active dependencies, and
  ADR-0014 remains a deliberate retained dependency.
- **Approved dependencies:** PASS — ADR-0004, ADR-0005, ADR-0008, ADR-0009,
  ADR-0011, ADR-0014, and ADR-0017 are approved and record the retained
  adapter, dashboard, package, Node technical boundary, Preview-retirement
  intent, and minimal Preview project-bus `.wisp/write.lock`
  mutual-exclusion and append-ordering boundary.
- **Testable acceptance criteria:** PASS — S1–S53, S64–S74, and S3a are GWT
  scenarios, R1–R77 and R87–R94 are EARS requirements, and the matrix names
  executable evidence. The remaining gaps preserve historical identifiers of
  retired family machinery.
- **Exactness:** PASS — all seven schemas, all success outputs,
  non-project-bus-lock failure envelopes and error mapping, project
  selection, stored-event validity, confinement/decoding, duplicate/unique
  command reduction, the per-operation append-commit meaning, qualified
  process-birth identity, finite limits, dashboard ownership,
  discovery/ownership/HTTP deadline/error/UI-projection/lifecycle behavior,
  schema-invalid dashboard-owner refusal, Node 24 one-argument JSON
  serialization and exact per-operation byte boundaries, the negative
  same-process/cross-process project-bus lock boundary, explicit preservation
  of ADR-0005's separate dashboard ownership/coordinator contract, absence of
  any concurrent aggregate-size or later-preservation/durability guarantee,
  issue #50's sole ownership of project-bus lock correctness, the
  capability's sole persistent location and permitted transient path,
  eight payload paths, `0.2.1-rc.4` carrier parity, retired-metadata absence,
  root-Claude/inline-Codex launch definitions, Node 24 technical targeting,
  Preview/no-support disclosure, and capability-safe evidence policy are
  fixed rather than deferred.
- **Open questions:** PASS — the required section is present below.
- **Scope fidelity:** PASS — ADR-0017 preserves ADR-0014's qualification
  retirement while superseding ADR-0016's positive project-bus lock-internal
  contract,
  makes no `.wisp/write.lock` mutual-exclusion or append-ordering promise for
  same-process or cross-process bus operations, preserves ADR-0005's separate
  user-runtime dashboard ownership/coordinator contract, and assigns all
  project-bus lock correctness and redesign solely to issue #50; event schema,
  validation, serialization, project confinement, per-operation byte
  accounting, plugin-only distribution, dual-host runtime, dashboard
  isolation/security/recovery, explicit skill boundary, and session-owned
  listener remain intact.

Result: **PASS**.

## Open questions

None.

## Gate record

Version 9 records the maintainer's explicit reset intent. The independent
decision adversary returned `SOUND` after the product-local capability-safe
evidence boundary was restored, and the independent conformance reviewer
returned `PASS`. Recording `approved` here records those completed gates; it
does not claim that the retained capability-safety implementation debt has
landed.

Version 10 records the ADR-0009 package-metadata amendment, ADR-0010's
observation-provenance repair, the corrected ten-path S20 count, and S32's
explicit safe-startup preconditions. The latter is an acceptance-wording
repair, not a dashboard implementation change. The configured rubric
self-check above passed and moved this version to `gated`. On 2026-07-25 the
independent spec adversary returned `APPROVE-READY`, which is the agent-owned
spec-gate ratification under the steward profile; the independent conformance
review returned `PASS`, and the corpus review returned `PASS`. The version
remains `gated`, the consumable state recorded by that agent-owned gate.

Version 12 records ADR-0014's retirement of aggregate qualification and
exact-surface machinery, eight-path payload, Preview/no-support posture,
`0.2.1-rc.4` retained-carrier parity, and preserved runtime and security
guarantees. The configured rubric self-check above passed, so this amendment
is `gated`; no independent spec-adversary or conformance verdict is claimed
here.

The first intrinsic spec-adversary pass for gated v12 returned
`NEEDS-REVISION`: malformed bus-lock salvage could steal a usable live
identity or race without raw-byte comparison, invalid dashboard owners could
be read as field-salvageable, capability locations contradicted their required
transient authorization flow, and compact serialization lacked exact Node 24
and boundary vectors. This repair makes each rule explicit in prose, GWT,
EARS, and the verification matrix while preserving v12 and ADR-0014 scope;
the rubric self-check remains `PASS`. No second adversary verdict is claimed
here.

Fresh intrinsic re-review found two residual contradictions in that repair:
an initially missing owner had no distinct snapshot/reread success path, and
the capability sink prohibition accidentally included the mandated
`wisp_dashboard` response transport. The final v12 repair adds
`owner-missing`→`owner-missing` as the sole missing-owner stale-rename path,
fails closed on appearance or disappearance across the snapshot seam, retains
raw-byte equality for present malformed owners, and exempts only the exact MCP
response and loopback request/response transport from the otherwise
fail-closed Wisp-controlled output-sink prohibition. Version 12 and ADR-0014
scope remain unchanged; no fresh adversary verdict is claimed here.

Final intrinsic review returned `APPROVE-READY` for exact commit `8dffff1`
([durable PR record](https://github.com/kodhama/wisp/pull/49#issuecomment-5082408652)),
and final fidelity review returned `PASS`
([durable PR record](https://github.com/kodhama/wisp/pull/49#issuecomment-5082408751)).
Under the steward profile's `spec=agent` gate, those durable records ratify
gated SPEC-0001 v12 for downstream consumption. Its status remains `gated`.

Version 13 derives the approved ADR-0015 scope correction: exact valid-owner,
malformed-byte, and missing-owner equality checks remain; every mismatch
observed before rename still fails closed; and the rename still atomically
quarantines whichever directory occupies the canonical pathname when it
executes. The spec no longer represents that pathname rename as conditional
on the inode that supplied the reread snapshot. It names the inherited
final-gap race as a Preview limitation, routes the crash-safe lock redesign
solely through issue #50 and a future ADR, and leaves ADR-0014 qualification
retirement plus all unaffected lock and product safety requirements intact.
The configured rubric self-check passed and the amendment remains `gated`
under the `spec=agent` profile; no v13 spec-adversary or conformance verdict
is claimed here.

Version 14 derives approved ADR-0016, which supersedes ADR-0015's incomplete
stale-only boundary. The current contract now applies the non-atomic
owner-match-to-pathname-mutation limitation to stale recovery, held release,
committed release, and matching cleanup; records replacement, disappearance,
symlink/type substitution, and rename failure as observed filesystem outcomes;
and limits uninterrupted exclusivity, rollback preservation of later commits,
and exact concurrent projected-size enforcement only under the resulting
ownership overlap. Outside that overlap, the enumerated schema,
serialization, per-operation size, commit-point, identity, snapshot, and
observed-mismatch guarantees remain current. Issue #50 is the sole redesign
venue. The configured rubric self-check passed and v14 remains `gated` under
the `spec=agent` profile; no v14 spec-adversary or conformance verdict is
claimed here.

The first intrinsic spec-adversary pass for gated v14 returned
`NEEDS-REVISION`: failed truncate was described as complete rollback,
post-rename pathname cleanup omitted its own substitution exposure, and the
release text conflated committed, held/pre-commit, retired-cleanup, and stale
budgets. This repair states successful and failed truncate outcomes without
weakening the original prefix, distinguishes completed append commit from
failed/short attempts, exposes pathname-addressed cleanup without inventing a
guard, and fixes each retry horizon in prose, GWT, EARS, and verification.
Version 14, ADR-0016 scope, and `gated` status remain unchanged; the rubric
self-check remains `PASS`, and no fresh adversary or conformance verdict is
claimed here.

Targeted conformance at exact head `3ed816e` then found four remaining source
mismatches: the acquisition deadline is computed before owner construction
and the first `mkdir`; the committed background scheduler has unref'd outer
50 ms timers but referenced 10 ms delays inside each 45 ms release attempt;
its 5,000 ms horizon starts after `operation()` returns, not at the event
write; and every non-`EEXIST` acquisition error unconditionally attempts owner
unlink then lock rmdir without token verification. The 250 ms and 45 ms
deadlines admit attempts rather than hard-bound their completion, and a worker
admitted at or before the horizon can finish, including successfully, after
it. This repair states those current behaviors and their
replacement/substitution exposure in constants, prose, GWT, EARS, and
verification while leaving redesign parked in issue #50. ADR-0016, version
14, `gated` status, and the rubric `PASS` remain unchanged; no new adversary
or conformance verdict is claimed here.

Version 15 derives approved ADR-0017 and significantly changes the behavioral
contract, so the version advances rather than remaining 14 under Grove's
versioning rule. It supersedes v14's positive project-bus `.wisp/write.lock`
mutual-exclusion and append-ordering requirements with one minimal negative
Preview boundary for both same-process and cross-process bus operations while
preserving ADR-0005's separate user-runtime dashboard ownership/coordinator
contract. The retained contract covers event schema, validation, exact
serialization, project confinement, per-operation byte accounting, and only
the fact that append commit completed the full event-plus-LF write; it
promises neither later preservation or durability nor a concurrent aggregate
bus-size bound. Issue #50 solely owns positive project-bus lock correctness.
ADR-0017 adds no further runtime lock change; PR #49 does not redesign the
project-bus lock or claim its correctness and retains its already present
bounded runtime, owner-validation, append, and canary repairs. The configured
rubric self-check passes, so v15 remains `gated`; no v15 adversary or
conformance verdict is claimed here. This targeted decision-adversary repair
corrects the scope and PR description without changing v15's behavioral
boundary. Targeted conformance at exact head `903a2d6` then found that generic
HTTP, MCP-envelope, unexpected-exception, and stdio-diagnostic clauses still
promised behavior for project-bus-lock-origin failures. This repair excludes
only those failures while preserving stable validation, non-lock MCP/HTTP,
dashboard, stdout-framing, capability-safety, and unrelated diagnostic
contracts; v15 remains `gated`, and no fresh verdict is claimed.
