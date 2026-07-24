---
id: spec-0001-plugin-mcp-distribution
type: spec
status: gated
depends_on:
  - adr-0004-codex-session-bootstrap
  - adr-0005-plugin-dashboard-lifecycle
  - adr-0008-retire-family-release-certification
implements: adr-0005-plugin-dashboard-lifecycle
owner: agent
updated: 2026-07-24
version: 9
---

# SPEC-0001 — Dual-host Wisp plugin, bundled stdio MCP, and project dashboard

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
and the Stewards marketplace pointer needed to install it.

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
versioned source module; manifests and qualification tests MAY duplicate only
values required by their external formats.

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
| Project bus write-lock wait | `5,000 ms` |
| Project bus write-lock poll interval | `10 ms` |
| Project bus ownerless-lock stale age | `120,000 ms` |
| Project bus release-rename synchronous retry budget | `250 ms` |
| Project bus retired-lock cleanup retries | `5` attempts at `50 ms` intervals |
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
| Supported Node release lines | `20.x`, `22.x`, `24.x` |

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

Dashboard ownership and project-bus write locks use one shared qualified
process-identity provider. A PID without its birth identity is never a
qualified identity and never proves that a recorded owner is still the same
process instance.

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
Live qualification repeats the current-PID observation for stability, proves
a simultaneously live child has a different token, and proves that child
becomes absent after exit. Deterministic injected evidence presents one PID
with recorded birth token A and later current birth token B. Qualification
never attempts to force OS PID reuse.

## Project bus write-lock contract

Every bus append, whether initiated by an MCP report/acknowledgement or the
dashboard command route, is serialized by the same project-local lock:

```text
<canonical-project>/.wisp/write.lock/
  owner.json
```

The lock directory is acquired by atomic `mkdir` with mode `0700`; no
check-then-create sequence is allowed. The owner file is then opened inside
the acquired directory with `O_WRONLY | O_CREAT | O_EXCL`, `O_NOFOLLOW` where
available, and mode `0600`. It is written completely and closed before the
protected bus operation begins. The exact owner schema rejects unknown
properties:

```json
{
  "token": "<lowercase UUID>",
  "pid": 123,
  "process_identity": "<qualified platform birth token>",
  "created": 1784900000000,
  "phase": "held"
}
```

`pid` is a positive integer no greater than the platform maximum. `created`
is a finite non-negative integer Unix epoch millisecond value. The token is
new for every acquisition attempt. `process_identity` is the shared qualified
provider's exact token for that PID. `phase` is exactly `held` or `committed`.
Acquisition fails as `bus_unwritable/process_identity_unavailable` before
`mkdir` if the current process cannot obtain a qualified identity.

Before acquisition or recovery, Wisp `lstat`s `write.lock` and, when present,
`owner.json`. A symbolic-link lock returns
`bus_unwritable/path_is_symlink`; a non-directory lock returns
`bus_unwritable/path_not_directory`; a symbolic-link owner returns
`bus_unwritable/path_is_symlink`; and a non-regular owner returns
`bus_unwritable/path_not_regular_file`. Stat/read failures return
`bus_unwritable/stat_failed` or `bus_unwritable/open_failed` as applicable.
Wisp never follows either path while deciding ownership.

Acquisition waits at most 5,000 ms from the first `mkdir` attempt and retries
an existing lock every 10 ms after recovery evaluation. A non-`EEXIST`
`mkdir`, owner open, owner write, or short-write failure cleans up only the
attempt's own owner file and directory when its token can be verified, then
returns `bus_unwritable/open_failed`. Expiry of the acquisition deadline also
returns `bus_unwritable/open_failed`; it does not perform an unlocked append.

Recovery follows these exact rules:

1. For an exact owner record, observe the recorded PID through the qualified
   provider. The same token means the recorded process instance may be live.
   A `held` lock is never stolen on age alone. An `inconclusive` observation
   is also never treated as stale.
2. `absent` or a different qualified token proves the recorded process
   instance gone, including PID reuse, and permits immediate stale recovery.
   PID existence alone never blocks or authorizes recovery.
3. A matching live `committed` record is safe to retire because its append
   commit point has passed. Any contender may retire it after rereading and
   matching the complete record.
4. For a missing or malformed owner that has no usable qualified identity,
   Wisp uses the exact valid `created` value when available and otherwise the
   lock-directory `mtime`. Only an age strictly greater than 120,000 ms
   permits ownerless-lock recovery.
5. Stale recovery rereads and matches the complete record when one was
   readable, then atomically renames `write.lock` to
   `write.lock.stale-<lowercase-UUID>`. A race or mismatch leaves the current
   lock untouched.
6. Wisp removes only `owner.json` from the quarantined directory and then the
   empty directory. Deletion cleanup is best-effort; acquisition restarts
   against the canonical `write.lock` path.

After acquiring the lock, Wisp revalidates the bus path and its projected
bounded append while protected. The append commit point is the successful
single `O_APPEND` write of every byte of the compact canonical event plus its
terminating LF. Before that point, a short or failed write attempts to restore
the original size and returns `bus_unwritable/append_failed`. After that
point, the event is irreversibly committed at the Wisp API boundary: Wisp
never truncates it and never returns append failure, because a caller retry
could duplicate the event.

Immediately after commit, Wisp atomically rewrites its matching owner record
from `phase: "held"` to `phase: "committed"` through a private
write-close-rename. It then rereads and matches the complete owner and
atomically renames canonical `write.lock` to
`write.lock.retired-<token>`. That rename is the release point: new writers
can acquire canonical `write.lock` even when deletion of the retired sibling
fails.

Owner-phase publication and canonical-release rename are retried
synchronously every 10 ms for at most 250 ms. A failure after append commit
still returns the exact append success and emits one redacted stderr
diagnostic containing only a fresh incident ID and the stage
`phase_publish`, `release_rename`, or `retired_cleanup`. It never exposes the
event, project path, owner token, PID, or OS exception.

If canonical-release rename still fails, the process records that token in a
process-local committed-token set and schedules an `unref` release worker
that retries matching-owner phase publication and release every 50 ms until
success or the 5,000 ms lock-wait horizon from commit expires. A later writer
in the same process encountering its own PID, qualified identity, and token
in that set performs the same release retry before ordinary recovery. Another
process may retire the lock only after it observes the committed phase or
proves the recorded process instance gone. If the horizon expires while the
canonical lock remains, subsequent writers follow ordinary acquisition and
may return `bus_unwritable/open_failed`; the already committed append remains
a success.

After the release rename, deletion of the retired owner and directory is
attempted at most five times at 50 ms intervals by an `unref` worker. Exhausted
deletion emits one redacted diagnostic but cannot block canonical lock
acquisition. For an operation that failed before commit, release uses the same
matching-record atomic rename; cleanup failure never replaces the original
bus error. A different token or identity never authorizes rename or deletion.
No code path appends outside this lock.

This project-local `write.lock` is transient bus serialization only. It is
not dashboard discovery, listener ownership, or capability state; those live
exclusively under the user-runtime dashboard root.

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

`owner.json` rejects unknown properties and is exactly one of these records:

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

Dashboard ownership uses the shared qualified process-identity contract
above; it does not define a weaker adapter. If the provider is unavailable
before acquisition, return
`dashboard_unavailable/process_identity_unavailable`. If an existing owner's
identity cannot be compared conclusively, return
`dashboard_unavailable/owner_identity_unverifiable` and never take ownership.

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
the recorded process instance is gone, including the PID-reuse case. Only then
may a contender reread the same instance, atomically rename `owner/` to a
private quarantine sibling, and restart acquisition. A missing, malformed, or
incomplete record without conclusive process evidence fails closed as
`owner_identity_unverifiable`; PID existence, age, or failed health alone
never proves death. Quarantine cleanup is best-effort and never delays
successful publication.

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
same response and compared without timing-dependent early exit. The
capability appears only in the private ready record and in the MCP-returned
URL:

```text
http://127.0.0.1:<port>/#capability=<capability>
```

The HTML bootstrap accepts exactly that fragment form, immediately removes it
from the visible URL with `history.replaceState`, retains the capability only
in the page's in-memory closure, and sends it as the bearer header. It SHALL
NOT store the capability in cookies, local storage, session storage, query
strings, logs, error bodies, stderr diagnostics, health responses, or
analytics. A replacement owner generates a new capability; an old capability
cannot authenticate to it.

A host qualification or canary harness may inspect the MCP-returned capability
URL and construct its bearer header only in volatile process memory while
proving dashboard behavior. Before any transcript or evidence crosses a
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
the same lock and bounded atomic append operation as MCP writes. Success is
exactly `{"ok":true,"data":{"event":<canonical-command-event>}}`. Wisp never
executes or automatically acknowledges the command.

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

Canonical runtime failures use the existing Wisp error envelope:
`invalid_input` returns `400`; `command_conflict` from `/api/events` returns
`409`; `bus_unreadable`, `bus_unwritable`, and `bus_limit_exceeded` return
`500`; and `internal_error` returns `500`. The `409` body preserves the exact
existing `command_conflict` details (`command_id`, `count`) and returns no
partial event data. Responses expose no OS exception text. No failure response
contains the capability.

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

Every invoked tool returns one JSON envelope in MCP `structuredContent` and an
identical compact JSON serialization in its sole text content item.

Success:

```json
{"ok":true,"data":{}}
```

Expected failure:

```json
{"ok":false,"error":{"code":"project_unresolved","message":"Human-readable summary","details":{}}}
```

`isError` is `false` for success and `true` for the failure envelope. Clients
SHALL branch on `code`, not `message`.

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

Error `code`, `details.reason`, and `details.field` values are contractual;
human-readable `message` and operating-system exception text are not.
`details.field` is an RFC 6901 JSON Pointer (`""` for the whole input,
`/run`, `/refs/3`, and so on).

Stable `invalid_input` reasons are `required`, `unknown_property`,
`null_not_allowed`, `wrong_type`, `blank`, `control_character`, `too_long`,
`too_many`, `invalid_enum`, `event_too_large`, and `cross_field`.
Stable `project_unresolved` reasons are `invalid_environment_root`,
`roots_unsupported`, `roots_list_failed`, `roots_absent`,
`roots_ambiguous`, and `invalid_file_root`.

Stable bus reasons are `path_is_symlink`, `path_not_directory`,
`path_not_regular_file`, `outside_project`, `stat_failed`, `mkdir_failed`,
`open_failed`, `read_failed`, `append_failed`, `process_identity_unavailable`,
and `invalid_utf8`.
`bus_unreadable` uses the applicable reason except `mkdir_failed` and
`append_failed` and never uses `process_identity_unavailable`;
`bus_unwritable` uses the applicable reason except `read_failed` and
`invalid_utf8`. Stable parse-error reasons are `invalid_json` and
`invalid_event`.

| Error code | Used when | Required `details` |
|---|---|---|
| `invalid_input` | A named tool's arguments violate its schema or cross-field rule | `field`, stable `reason`, and `limit`/`actual` when bounded |
| `project_unresolved` | Project selection fails | `reason` from the resolution contract and `source` (`environment` or `roots`) |
| `bus_unreadable` | The selected bus cannot be safely statted, contained, decoded, or read | `path`, stable `reason` |
| `bus_unwritable` | Directory validation/creation, containment, open, or append fails | `path`, stable `reason` |
| `bus_limit_exceeded` | Bus, line, command count, or parse-error count exceeds a fixed maximum | `subject` (`bus`, `line`, `commands`, or `parse_errors`), `unit` (`utf8_bytes` or `items`), `limit`, `actual` |
| `command_not_found` | No matching command exists in the run | `command_id` |
| `command_conflict` | More than one matching command id exists in the run | `command_id`, `count` |
| `command_not_pending` | The unique command is already dispositioned | `command_id`, `status` |
| `command_not_targeted` | The unique pending command targets another agent | `command_id`, `target`, `agent` |
| `dashboard_unavailable` | Dashboard startup, reuse, or safe recovery cannot complete | stable `reason`, `retryable` |
| `dashboard_version_conflict` | A live owner uses another dashboard protocol | `expected_protocol`, `actual_protocol` |
| `internal_error` | An unexpected server defect reaches the adapter | `incident_id` |

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
An unexpected handler exception is caught, diagnosed on stderr, and returned
as `internal_error` without terminating a valid session.

Malformed bus lines are data only on a successful `wisp_check` when all read
limits are satisfied. They are never rewritten or represented as events.

## Stdio and executable contract

`node dist/wisp.mjs` starts the server over stdio and starts no CLI or HTTP
listener before an explicit `wisp_dashboard` call. Stdout contains MCP
protocol frames only, including while the dashboard runs. Startup text,
diagnostics, and exception detail use stderr.

The source is TypeScript. The distributed artifact is ordinary JavaScript
containing all runtime dependencies and compatible with Node 20.x, 22.x, and
24.x. Plugin installation and invocation SHALL NOT run lifecycle scripts,
access a package registry, invoke `npm`/`npx`, require a global `wisp`, or
resolve project/global packages. Host configs MAY resolve the host-provided
`node` executable from `PATH`. The payload declares no binary and the bundle
has no CLI command dispatcher.

## Plugin, skill, marketplace, and qualification contract

`plugins/wisp/` SHALL contain exactly these eight release paths:

- `.claude-plugin/plugin.json`;
- `.codex-plugin/plugin.json`;
- `.mcp.json`;
- `dist/wisp.mjs`;
- `skills/wisp/SKILL.md`;
- `skills/dashboard/SKILL.md`;
- `README.md`; and
- `qualification.json`.

Both manifests declare the same semantic version.

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

Stewards adds one `git-subdir` entry for `kodhama/wisp`, path `plugins/wisp`;
it carries neither a bundle copy nor a separate Wisp version.

A plugin version is releasable only when one build:

1. launches from a clean fixture with no project `node_modules` and no global
   `wisp` on the latest available patch of Node 20.x, 22.x, and 24.x;
2. validates the Claude and Codex manifests independently;
3. installs in a single-project fixture under current stable Claude Code,
   lists the exact seven tools, invokes `wisp_check`, performs one write,
   explicitly opens the dashboard, and verifies the exact
   `<fixture>/.wisp/events.ndjson` bus;
4. installs the exact candidate through a marketplace named `kodhama`, then
   independently performs the same evidence under current stable Codex CLI;
5. concurrently opens both installed hosts on one project and proves one
   dashboard owner and URL, then proves distinct-project isolation; and
6. hashes the exact `dist/wisp.mjs` artifact and records all evidence in
   `qualification.json`.

`qualification.json` rejects unknown properties and has this exact schema:

```json
{
  "plugin_version": "semantic version",
  "artifact_sha256": "64 lowercase hexadecimal characters",
  "date": "YYYY-MM-DD",
  "platform": "Node process.platform value",
  "architecture": "Node process.arch value",
  "node_versions": {
    "20": {"version": "exact 20.x.y", "result": "pending"},
    "22": {"version": "exact 22.x.y", "result": "pending"},
    "24": {"version": "exact 24.x.y", "result": "pending"}
  },
  "claude": {
    "version": "exact host version",
    "result": "pending",
    "tools_listed": false,
    "check_passed": false,
    "write_passed": false,
    "bus_path_verified": false
  },
  "codex": {
    "version": "exact host version",
    "result": "pending",
    "tools_listed": false,
    "check_passed": false,
    "write_passed": false,
    "bus_path_verified": false
  },
  "dashboard": {
    "result": "pending",
    "explicit_start_only": false,
    "claude_open_passed": false,
    "codex_open_passed": false,
    "cross_host_singleton_passed": false,
    "project_isolation_passed": false,
    "command_append_passed": false,
    "security_passed": false,
    "cleanup_recovery_passed": false,
    "process_identity_passed": false
  },
  "result": "pending"
}
```

Each `result` is exactly `pending`, `pass`, or `fail`; the four evidence
fields in each host object and the nine evidence fields in `dashboard` are
booleans. `plugin_version` is valid SemVer, `artifact_sha256`
matches `^[0-9a-f]{64}$`, and `date` is a real calendar date in
`YYYY-MM-DD`. Each Node-line object rejects unknown properties, requires
exactly `version` and `result`, and uses an exact matching `20.x.y`, `22.x.y`,
or `24.x.y` version or the literal `pending`; its result uses the shared
result enum. Each host `version` is either `pending` or a nonblank exact
version string. The dashboard object rejects unknown properties and requires
exactly the shown result and evidence fields. A development payload may use
the shown false booleans, `pending` version sentinels, per-line/host/dashboard
pending results, and overall `pending`.

`process_identity_passed` becomes true only when both reproducible evidence
classes and the platform parser suite pass:

1. The applicable exact Linux or macOS parser fixtures in the qualified
   process-identity contract all pass. A platform without a specified
   provider, including Windows in v6, cannot set this evidence true.
2. On the qualification platform, repeated provider observations of the
   current PID return one stable exact token; an independently spawned live
   child returns a different token; and after that child exits the provider
   reports it absent.
3. A deterministic injected provider presents the same numeric PID first with
   recorded token A and then with current token B. Recovery classifies the
   owner as the old process instance, quarantines only its matching record,
   for both dashboard ownership and the project bus write lock.

Qualification SHALL NOT claim or attempt to force live OS PID reuse. The
deterministic same-PID/new-token vector is the required PID-reuse evidence.

Overall `result` may be `pass` only when no version value is `pending`, all
three Node-line results are `pass`, both host results and the dashboard result
are `pass`, all eight host evidence fields and all nine dashboard evidence
fields are true, manifest versions equal `plugin_version`, and
`artifact_sha256` matches the shipped bundle. Release requires overall
`pass`; any Node-line, host, or dashboard failure blocks release. Older host
versions are unsupported unless a future qualification record explicitly
adds them.

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
  returned-count boundary,
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

- **Given** each error class plus an unknown tool and a pre-tool malformed
  request,
- **When** MCP handles them,
- **Then** named-tool errors use the stable `isError` envelope, the unknown
  tool uses `-32601`, and the malformed request uses `-32602`.

**S18 — Stdout purity**

- **Given** startup, success, expected failures, and an unexpected handler
  exception,
- **When** the process is exercised over stdio,
- **Then** stdout parses wholly as MCP traffic and diagnostics appear only on
  stderr.

**S19 — Import safety**

- **Given** every reusable module,
- **When** imported without invoking an entrypoint,
- **Then** it parses no arguments, starts no listener, emits no output, and
  performs no bus I/O.

**S20 — Exact plugin payload**

- **Given** the built `plugins/wisp/` directory,
- **When** its release payload and executable surfaces are inspected,
- **Then** it contains exactly the eight specified paths, declares no binary
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

**S24 — Independent host releases**

- **Given** a release candidate,
- **When** Claude and Codex qualification run,
- **Then** each independently proves tool listing, check, write, explicit
  dashboard open, and exact bus path in a single-project fixture and either
  failure blocks release.

**S25 — Supported Node lines**

- **Given** the clean bundled artifact,
- **When** it runs on the recorded latest patches of Node 20, 22, and 24,
- **Then** all three launch and contract suites pass without dependency
  resolution and each exact version/result pair is recorded under its Node
  line.

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

**S28 — Qualification lifecycle**

- **Given** a development payload before live host validation,
- **When** `qualification.json` is inspected,
- **Then** its exact schema may report `pending`, but release remains blocked
  until the artifact hash, all three Node-line results, both host results, and
  the dashboard result, all eight host evidence booleans, and all nine
  dashboard evidence booleans satisfy overall `pass`.

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

- **Given** a resolved project,
- **When** `wisp_dashboard` receives `{}` or any null/property-bearing input,
- **Then** `{}` returns the exact URL/reused success envelope while every
  other input returns the specified `invalid_input` without dashboard state.

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
- **Then** only the exact discriminated schema is accepted and a ready record
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
  capability succeeds, the stale capability fails generically, and neither
  capability appears in persistence, logs, diagnostics, health, or errors.

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
  `maintainer` command through the shared lock/append path, every invalid body
  appends zero bytes, and no command is executed or acknowledged.

**S44 — Project-key isolation**

- **Given** two canonical projects with the same basename and sessions from
  both hosts,
- **When** each explicitly opens and uses its dashboard,
- **Then** the SHA-256 keys, owners, listeners, event reads, and command
  appends remain isolated to their respective project buses.

**S45 — Cross-host singleton qualification**

- **Given** current-stable Claude Code and Codex installed from the exact
  candidate and opened on one project,
- **When** both explicitly request the dashboard concurrently,
- **Then** they return one URL and the qualification record proves both host
  opens, cross-host singleton behavior, identity, security, commands, cleanup,
  recovery, and project isolation.

**S46 — No legacy or detached surface**

- **Given** the source graph and built plugin,
- **When** imports, processes, listeners, paths, and executable declarations
  are inspected,
- **Then** there is no CLI, daemon, detached child, browser/shell launch,
  remote transport, external dashboard resource, or legacy `.grove` data
  path, and only explicit dashboard invocation can start HTTP.

**S47 — Exact project bus write lock**

- **Given** concurrent appends, exact and malformed owner records, live/dead
  qualified process identities, same-PID/different-birth tokens, ownerless
  locks below/above 120,000 ms, symlink/wrong-type paths, and a held lock
  beyond 5,000 ms,
- **When** MCP and dashboard writers acquire, recover, use, and release
  `.wisp/write.lock`,
- **Then** `mkdir`/`O_EXCL` serialize every append, live owners are never
  stolen by PID-only reasoning, same-PID/new-birth owners are recoverable,
  only exact stale cases are quarantined, cleanup removes only the matching
  token and identity, and each unsafe/timeout condition uses the specified
  stable bus error without unlocked append.

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

**S51 — Irreversible append commit and nonblocking release**

- **Given** a full append followed by failures publishing committed phase,
  renaming canonical lock, and deleting a retired lock, plus a caller that
  would retry on failure,
- **When** Wisp crosses the exact append commit point,
- **Then** it always returns append success, never truncates or invites a
  duplicate retry, emits only redacted incident diagnostics, retries matching
  same-owner release synchronously and through `unref` recovery, and a
  successfully retired canonical lock permits new writers despite deletion
  failure.

**S52 — Exact qualified process providers**

- **Given** every Linux and macOS parser fixture, live current/child/exit
  observations, deterministic same-PID/new-birth tokens, and Windows,
- **When** the shared identity provider is qualified,
- **Then** only exact Linux boot-id/start-ticks and macOS absolute-`/bin/ps`
  C-locale tokens qualify, both dashboard and bus recovery use them, Windows
  remains unsupported, and no PID-only result is accepted.

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

- **Given** a host qualification, canary, or browser harness that has received
  a live dashboard fragment and used it as a bearer in volatile memory,
- **When** the harness prepares any transcript or evidence for persistence or
  upload,
- **Then** every fragment-form and bearer-form capability is replaced by a
  non-secret structural sentinel before the first write, the observed
  capability and every capability-shaped form are absent from retained bytes
  and logs, browser failure writers cannot persist raw trace/video/screenshot/
  console/network/reporter data, and a failed redaction check blocks
  persistence and upload.

### EARS requirements

- **R1 (ubiquitous):** Wisp shall own the complete payload and Stewards shall
  own only its thin pointer and repository-local provenance.
- **R2 (ubiquitous):** Claude and Codex manifests shall declare one semantic
  plugin version and launch one bundled executable.
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
- **R19 (event-driven):** When a named tool fails, it shall return the stable
  error envelope with `isError: true`.
- **R20 (unwanted behavior):** If a tool is unknown or a request is malformed
  before tool identification, MCP shall use `-32601` or `-32602`
  respectively.
- **R21 (state-driven):** While in MCP mode, stdout shall contain MCP protocol
  traffic only and diagnostics shall use stderr.
- **R22 (event-driven):** When a reusable module is imported, it shall perform
  no entrypoint or I/O side effect.
- **R23 (ubiquitous):** The six event/check MCP handlers shall call the shared
  runtime operations and constants, and `wisp_dashboard` shall call the
  memoized dashboard coordinator.
- **R24 (ubiquitous):** The plugin bundle shall expose no CLI entrypoint,
  binary declaration, or CLI command dispatch.
- **R25 (ubiquitous):** The plugin payload shall contain exactly the eight
  specified release paths, with Claude's server in root `.mcp.json` and
  Codex's server inline in its manifest.
- **R26 (ubiquitous):** The lifecycle and dashboard skills shall contain
  portable policy only and shall delegate mechanics to MCP.
- **R27 (ubiquitous):** Multiple project processes shall not share a default
  bus or machine-wide daemon.
- **R28 (ubiquitous):** A release shall pass clean-bundle tests on the latest
  patch of Node 20.x, 22.x, and 24.x and record each exact version and result.
- **R29 (ubiquitous):** A release shall independently pass current-stable
  Claude Code and Codex manifest, install, launch, tool-list, check, write,
  explicit-dashboard-open, and exact-bus-path tests.
- **R30 (event-driven):** When qualification completes, the checked-in record
  shall name the exact plugin, Node, Claude, and Codex versions, date, and
  result.
- **R31 (unwanted behavior):** If `.wisp` or the bus is a symlink, has the
  wrong type, or resolves outside the canonical project, Wisp shall return the
  stable bus error without bus content I/O.
- **R32 (event-driven):** When Wisp reads a bus, it shall use fatal UTF-8
  decoding and the exact LF, CR, final-segment, blank-line, byte-counting, and
  parse-reason rules.
- **R33 (event-driven):** When commands are reduced, Wisp shall preserve
  command append order, reduce only unique ids, and apply only later same-run
  acknowledgements, with the last applicable acknowledgement winning.
- **R34 (ubiquitous):** `qualification.json` shall implement the exact schema,
  including each Node line's version/result object and the dashboard result
  and evidence object, may remain `pending` during development, and shall be
  overall `pass` before release.
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
- **R49 (ubiquitous):** Capability material shall exist only in the private
  ready record, returned URL, and page memory, shall rotate per owner
  generation, and shall never appear in persistence, logs, diagnostics,
  health, analytics, or errors.
- **R50 (event-driven):** When authenticated events are requested, Wisp shall
  return all valid events, malformed-line evidence, and all command states
  through the shared bounded bus reader and command reducer in physical
  order.
- **R51 (event-driven):** When an exact authenticated same-origin command is
  submitted, Wisp shall create one canonical `maintainer` command and append
  it through the shared lock and atomic bus writer.
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
- **R57 (ubiquitous):** Release qualification shall independently open the
  dashboard in Claude Code and Codex and jointly prove cross-host singleton,
  project isolation, command append, security, cleanup/recovery, and qualified
  process identity.
- **R58 (ubiquitous):** Every project-bus append shall use the exact
  `.wisp/write.lock` location, owner schema, atomic `mkdir`/`O_EXCL`
  acquisition, 5,000 ms wait, 10 ms poll, 120,000 ms ownerless-stale policy,
  lstat defenses, recovery, matching-token cleanup, and stable error mapping.
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
- **R63 (ubiquitous):** Process-identity qualification shall combine live
  provider stability/child/absence evidence with a deterministic injected
  same-PID/new-token recovery test and shall not require forced OS PID reuse.
- **R64 (event-driven):** When `wisp_dashboard` is the process's first tool,
  Wisp shall resolve and memoize the canonical project before user-runtime,
  discovery, or listener work.
- **R65 (ubiquitous):** Dashboard command-state output shall use the same
  reducer and duplicate/acknowledgement semantics as `wisp_check`; neither the
  HTTP adapter nor browser shall implement a second reduction.
- **R66 (state-driven):** Once the complete event-plus-LF append write
  succeeds, Wisp shall treat it as irreversibly committed, return append
  success regardless of later lock cleanup failure, never truncate it, and
  emit only a redacted incident diagnostic for post-commit failures.
- **R67 (event-driven):** When releasing a matching bus lock, Wisp shall
  atomically rename canonical `write.lock` to its retired sibling, retry
  release within the exact synchronous and `unref` budgets, let same-owner
  committed-token recovery resume it, and ensure retired deletion failure
  cannot block new canonical acquisitions.
- **R68 (ubiquitous):** Bus-lock owner records shall include the qualified
  process birth identity and phase, and stale/PID-reuse recovery shall never
  use PID existence alone.
- **R69 (ubiquitous):** Qualified process identity shall use exactly Linux
  boot ID plus `/proc` start ticks or macOS absolute `/bin/ps` start time under
  C locale; Windows and unspecified platforms shall remain unsupported.
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
- **R87 (event-driven):** When host qualification, canary, or browser evidence
  is retained, the harness shall use dashboard capability material only in
  volatile memory, disable or pre-sink sanitize every browser failure writer,
  redact fragment, bearer, and raw observed forms before the first persistent
  write, verify that no observed or capability-shaped value remains, and
  block persistence and upload on failure while preserving only non-secret
  typed structural evidence.

## Verification matrix

| Contract area | Minimum evidence |
|---|---|
| Constants and schemas | Generated-schema snapshot plus table-driven at-limit/over-limit tests for every fixed value, all seven tools, both owner-record variants, all six stored-event kinds, exact timestamp/version, null/unknown rejection, and recursively arbitrary command-payload JSON |
| Resolution | Table-driven tests for environment root, capability absence, list failure/timeout, counts, URI validity, realpath, no-I/O, memoization, and dashboard-as-first-tool success/failure ordering; Codex host smoke verifies session-cwd binding |
| Filesystem | Temp-project tests for missing read, first-write creation, lstat/symlink/type/containment rejection, one-line append, fatal UTF-8, LF/CR/final-segment/blank handling, limits, and no truncation |
| Project write lock | Cross-process and injected-filesystem tests cover the qualified-identity/phase owner schema, `mkdir`/`O_EXCL`, concurrent MCP/dashboard appends, exact commit point and post-commit success, phase/release failure, 250 ms synchronous and `unref` same-owner recovery, retired-deletion failure with continued new acquisition, 5,000 ms/10 ms timing, live/dead/same-PID-new-birth/PID-less/malformed owners, 120,000 ms boundary, symlink/types, stale quarantine, matching-token/identity cleanup, redacted diagnostics, and every stable error |
| Dashboard discovery | Fake-home and process-identity adapters prove exact root/key derivation, ownership/mode/type/symlink rejection, project-ancestor rejection, candidate promotion, mandatory post-acquisition recheck, authenticated reuse, bounded starting wait, live-owner refusal, deterministic same-PID/new-token recovery, contention, and distinct-project isolation |
| Process identity | Linux fixtures prove boot-ID and `/proc/<pid>/stat` field-22 parsing including hostile `comm`; macOS fixtures prove absolute `/bin/ps` C-locale parsing and failures; live current/child/exit observations plus deterministic same-PID/new-birth-token adapters exercise both dashboard and bus recovery; Windows is rejected |
| Dashboard faults/lifecycle | Fault injection before claim and after claim/bind/publish/completion plus stdio close, `SIGINT`, and `SIGTERM` proves failed-live-owner listener/record cleanup, no bound-unpublished survivor, dead-owner recovery, 1,000 ms bounded drain, forced tracked-socket destruction, matching-instance cleanup, and no daemon |
| Dashboard HTTP/UI | Loopback and browser-DOM tests snapshot exact precedence, condition/status/code mapping including `command_conflict`→`409`, routes/envelopes/headers, acceptance-to-`CRLFCRLF` header bytes/deadline, header-to-body-complete deadline, acceptance-to-response-complete total deadline, keep-alive idle and cleanup-to-forced-close boundaries, bearer, Host, Origin, query, method, content type, body, CSP, capability-bootstrap/rotation/redaction, refresh/visibility/in-flight behavior, exact run/agent append-order projection, text-only rendering, event/parse-error/command-state views, explicit command controls, and zero-write failures |
| Capability-safe host evidence | Qualification, canary, and Playwright-failure fixtures place the live capability in fragment, bearer, console, network, reporter, screenshot, video, trace, and attachment paths; prove raw bytes remain volatile and browser artifact writers are disabled or intercepted before a sink; require exact structural sentinels and typed fields; scan retained evidence/logs for observed and capability-shaped values; and prove a failed scan produces no persisted or uploaded artifact |
| Runtime boundary | Spies or dependency injection prove all six event/check MCP handlers call shared operations, `wisp_dashboard` calls the memoized coordinator, HTTP reads/writes reuse the canonical runtime, and HTTP/browser contain no second command reducer |
| Command safety | Append-order tests prove issued fields, whole-check first-duplicate conflict/count/no-partial-data, ack duplicate conflict, unique-id-only reduction, same-run/following-ack filtering, last-ack wins, stable ordering, all-status dashboard projection, no execution, and every acknowledgement result |
| Errors | Contract snapshots for all MCP and HTTP code/reason/JSON-pointer/detail shapes, retryability, `process_identity_unavailable`, parse reasons, `isError`, `-32601`, `-32602`, dashboard version conflict, HTTP `409` command conflict, post-commit diagnostic redaction, and unexpected-exception containment |
| Stdio | Spawned-process transcript proves all stdout is MCP framing and diagnostics are stderr-only |
| Import safety | Isolated import probes for every reusable module prove no bus or dashboard state and no listener before explicit invocation |
| Bundle | Clean fixtures with no global Wisp or dependency tree launch the exact distributed artifact on recorded Node 20, 22, and 24 patches |
| Claude | Validate exact `.mcp.json`; installed current-stable smoke lists seven tools, checks, writes, explicitly opens the dashboard, and verifies fixture `.wisp/events.ndjson` |
| Codex | Separately validate the manifest's one inline bootstrap, absent `cwd`, forwarded `CODEX_HOME`, exact marketplace/plugin/version cache path, and absence of a custom config path; install through marketplace `kodhama`, then smoke lists seven tools, checks, writes, explicitly opens the dashboard, and verifies fixture `.wisp/events.ndjson` |
| Cross-host dashboard | Concurrent installed Claude and Codex sessions on one fixture return one URL; a second fixture remains isolated; command, security, lifecycle/recovery, live provider stability/child/absence evidence, and deterministic same-PID/new-token recovery populate the dashboard qualification object |
| Plugin contents | Exact eight-path inventory, equal manifest versions, no CLI/binary/daemon/legacy dashboard path, two portable-skill static checks, bundle SHA-256, and exact qualification schema/state rules including all Node, host, and dashboard result objects |
| Marketplace | Stewards fixture resolves exactly to `kodhama/wisp:plugins/wisp` and contains no implementation/version copy |

## Rubric check

The configured `SPEC_RUBRIC_PATH` says no dedicated rubric exists, so this
check uses `specs/README.md`.

- **Frontmatter:** PASS — all required fields are present; `version: 9`
  records the retirement amendment while preserving forward-only spec identity.
- **Approved dependencies:** PASS — ADR-0004 and ADR-0005 are approved and
  record the Codex adapter and dashboard intent respectively.
- **Testable acceptance criteria:** PASS — S1–S53, S64, and S3a are GWT
  scenarios, R1–R72 and R87 are EARS requirements, and the matrix names
  executable evidence. The gaps preserve the historical identifiers of the
  retained product-local security clauses while retiring intervening family
  machinery.
- **Exactness:** PASS — all seven schemas, outputs, error mapping, project
  selection, stored-event validity, confinement/decoding, duplicate/unique
  command reduction, irreversible append/release behavior, qualified
  process-birth identity, finite limits, dashboard write-lock,
  discovery/ownership/HTTP deadline/error/UI-projection/lifecycle behavior,
  eight payload paths, root-Claude/inline-Codex launch definitions, and
  Node/host/dashboard qualification and capability-safe evidence policy are
  fixed rather than deferred.
- **Open questions:** PASS — the required section is present below.
- **Scope fidelity:** PASS — the plugin-only distribution, dual-host evidence,
  project bus and dashboard isolation, explicit skill boundary, session-owned
  listener, and Stewards pointer derive from ADR-0004 and ADR-0005; parked
  CLI, daemon, remote transport, and legacy dashboard behavior are absent.

Result: **PASS**. The spec remains `gated` for independent convergence review.

## Open questions

None.
