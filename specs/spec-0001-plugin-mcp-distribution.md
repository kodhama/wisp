---
id: spec-0001-plugin-mcp-distribution
type: spec
status: gated
depends_on: [adr-0004-codex-session-bootstrap]
owner: agent
updated: 2026-07-24
version: 5
---

# SPEC-0001 — Dual-host Wisp plugin and bundled stdio MCP server

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
portable lifecycle skill, and the Stewards marketplace pointer needed to
install it.

MCP is the plugin's only executable interface. Claude binds from its official
project substitution; Codex binds from its host-selected active session
directory. Neither requires Wisp project configuration. Other MCP clients may
use the single-file-root fallback. Legacy CLI source may remain outside the
plugin, but this release defines and ships no CLI, binary declaration, or CLI
compatibility behavior.

Remote transport, hosted multi-tenancy, OpenTelemetry, CloudEvents, npm, and
Homebrew publication are outside this specification.

## Fixed product constants

All implementations and generated schemas SHALL import these values from one
versioned source module; manifests and qualification tests MAY duplicate only
values required by their external formats.

| Constant | Value |
|---|---:|
| Protocol version | `1` |
| Default project bus | `.wisp/events.ndjson` |
| MCP roots-list timeout | `5,000 ms` |
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
| Runtime | Constants, domain validation, event stamping, bus reads/appends, command reduction, pending-command filtering, acknowledgement authorization | Parse process arguments, perform MCP framing, or start listeners |
| MCP adapter | Initialization, immutable project resolution, six tool adapters, MCP result mapping, stdio discipline | Issue or execute commands, use process cwd inside the generic resolver, or accept per-call paths |
| Codex bootstrap | Bind Codex's host-selected session cwd into `WISP_PROJECT_ROOT` and import the installed bundle | Accept model-supplied paths, fetch, install, or emit protocol text |
| Bundled entrypoint | Start the stdio MCP server | Dispatch CLI commands, fetch dependencies, or perform work on import |
| Plugin payload | Exact files named below | Depend on global `wisp`, `npm`/`npx`, project `node_modules`, or a daemon |
| Lifecycle skill | Portable lifecycle guidance using the six MCP tools | Define transport mechanics or consumer-specific governance |
| Stewards entry | Thin `git-subdir` pointer | Copy or independently version Wisp |

Importing any reusable module SHALL parse no arguments, start no MCP or HTTP
listener, emit no output, and perform no bus I/O.

## Project resolution and filesystem contract

Resolution runs at most once per MCP process, after initialization and before
the first tool performs bus I/O. The success or failure is memoized for the
process lifetime.

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

All six tools reject unknown properties and `null`. `run`, `agent`, `to`,
`via`, `question_id`, and `command_id` use the identifier rule.

| Tool | Required input properties | Optional input properties and defaults |
|---|---|---|
| `wisp_status` | `run`, `agent`, `state` | `activity`, `refs`, `to`, `via` |
| `wisp_heartbeat` | `run`, `agent` | `to`, `via` |
| `wisp_verdict` | `run`, `agent`, `verdict` | `activity`, `refs`, `to`, `via` |
| `wisp_question` | `run`, `agent`, `question_id`, `text` | `to`, `via` |
| `wisp_check` | `run`, `agent` | none |
| `wisp_ack` | `run`, `agent`, `command_id` | `result` defaults to `accepted`; `note`, `to`, `via` |

`state` and `result` use the canonical enums. `verdict` uses the verdict
maximum; `activity`, `note`, `text`, and `refs` use the fixed product
constants. No input includes a timestamp, version, project, root, bus path,
arbitrary metadata, or command payload.

The four event-reporting tools and `wisp_ack` call the corresponding shared
runtime operation and return the exact event appended. `wisp_check` returns
only pending commands in the requested run whose target equals `agent` or
`*`; it does not execute, interpret, mutate, or acknowledge them.

`wisp_ack` SHALL append only when exactly one command with `command_id` exists
in the requested run, its append-order-reduced status is pending, and its
target equals the acknowledging agent or `*`. Missing, duplicate,
non-pending, and differently targeted commands fail without append.

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
`open_failed`, `read_failed`, `append_failed`, and `invalid_utf8`.
`bus_unreadable` uses the applicable reason except `mkdir_failed` and
`append_failed`; `bus_unwritable` uses the applicable reason except
`read_failed` and `invalid_utf8`. Stable parse-error reasons are
`invalid_json` and `invalid_event`.

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
| `internal_error` | An unexpected server defect reaches the adapter | `incident_id` |

Serialized-event excess is `invalid_input` with field `""`, reason
`event_too_large`, `limit`, and `actual`. `command_not_pending.status` is
exactly `accepted`, `rejected`, or `completed`.

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
listener. Stdout contains MCP protocol frames only. Startup text, diagnostics,
and exception detail use stderr.

The source is TypeScript. The distributed artifact is ordinary JavaScript
containing all runtime dependencies and compatible with Node 20.x, 22.x, and
24.x. Plugin installation and invocation SHALL NOT run lifecycle scripts,
access a package registry, invoke `npm`/`npx`, require a global `wisp`, or
resolve project/global packages. Host configs MAY resolve the host-provided
`node` executable from `PATH`. The payload declares no binary and the bundle
has no CLI command dispatcher.

## Plugin, skill, marketplace, and qualification contract

`plugins/wisp/` SHALL contain exactly these seven release paths:

- `.claude-plugin/plugin.json`;
- `.codex-plugin/plugin.json`;
- `.mcp.json`;
- `dist/wisp.mjs`;
- `skills/wisp/SKILL.md`;
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

The skill instructs agents to report actual transitions, heartbeat after
meaningful silence, check at handoff seams, and acknowledge commands they
handled through the MCP tools. It contains no shell syntax, paths, Grove role
names, Grove verdict grammar, command auto-obedience, or consumer truth claim.

Stewards adds one `git-subdir` entry for `kodhama/wisp`, path `plugins/wisp`;
it carries neither a bundle copy nor a separate Wisp version.

A plugin version is releasable only when one build:

1. launches from a clean fixture with no project `node_modules` and no global
   `wisp` on the latest available patch of Node 20.x, 22.x, and 24.x;
2. validates the Claude and Codex manifests independently;
3. installs in a single-project fixture under current stable Claude Code,
   lists the exact six tools, invokes `wisp_check`, performs one write, and
   verifies the exact `<fixture>/.wisp/events.ndjson` bus;
4. installs the exact candidate through a marketplace named `kodhama`, then
   independently performs the same evidence under current stable Codex CLI;
   and
5. hashes the exact `dist/wisp.mjs` artifact and records all evidence in
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
  "result": "pending"
}
```

Each `result` is exactly `pending`, `pass`, or `fail`; the four evidence
fields are booleans. `plugin_version` is valid SemVer, `artifact_sha256`
matches `^[0-9a-f]{64}$`, and `date` is a real calendar date in
`YYYY-MM-DD`. Each Node-line object rejects unknown properties, requires
exactly `version` and `result`, and uses an exact matching `20.x.y`, `22.x.y`,
or `24.x.y` version or the literal `pending`; its result uses the shared
result enum. Each host `version` is either `pending` or a nonblank exact
version string. A development payload may use those `pending` version
sentinels, per-line/host pending results, and overall `pending`.

Overall `result` may be `pass` only when no version value is `pending`, all
three Node-line results are `pass`, both host results are `pass`, all eight
host evidence fields are true, manifest versions equal `plugin_version`, and
`artifact_sha256` matches the shipped bundle. Release requires overall
`pass`; any Node-line or host failure blocks release. Older host versions are
unsupported unless a future qualification record explicitly adds them.

## Acceptance criteria

### Given/When/Then scenarios

**S1 — Zero-configuration single project**

- **Given** a Claude or Codex session opened on one project,
- **When** the host launches Wisp and the first bus tool is called,
- **Then** it selects `<real-project>/.wisp/events.ndjson` without project
  setup.

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
- **Then** exactly the six named schemas and the properties, enums, defaults,
  limits, unknown-property rejection, and envelopes in this spec are present.

**S12 — Boundary validation**

- **Given** each string, reference count, event size, bus size, line size, and
  returned-count boundary,
- **When** values at and one unit beyond the boundary are exercised,
- **Then** boundary values succeed and excess values return the specified
  error without partial output or append.

**S13 — Shared runtime**

- **Given** each of the six MCP tools,
- **When** its handler performs domain work,
- **Then** it delegates to the reusable runtime and contains no parallel
  validation, reduction, or bus implementation.

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

**S20 — Exact MCP-only payload**

- **Given** the built `plugins/wisp/` directory,
- **When** its release payload and executable surfaces are inspected,
- **Then** it contains exactly the seven specified paths, declares no binary
  or CLI dispatcher, Claude launches through root `.mcp.json`, and Codex
  launches through the manifest's inline server definition.

**S21 — Project isolation**

- **Given** two MCP processes rooted in different projects,
- **When** each writes,
- **Then** each event appears only in its selected project bus.

**S22 — Tool boundary**

- **Given** an initialized MCP server,
- **When** tools are listed and unknown handlers are probed,
- **Then** only the six Wisp tools exist and no command-issuance path is
  reachable.

**S23 — Skill portability**

- **Given** the packaged skill,
- **When** its contents are inspected,
- **Then** it delegates mechanics to MCP and contains none of the prohibited
  host-, shell-, path-, Grove-, or auto-obedience policy.

**S24 — Independent host releases**

- **Given** a release candidate,
- **When** Claude and Codex qualification run,
- **Then** each independently proves tool listing, check, write, and exact bus
  path in a single-project fixture and either failure blocks release.

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
  all eight host evidence booleans satisfy overall `pass`.

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

### EARS requirements

- **R1 (ubiquitous):** Wisp shall own the complete payload and Stewards shall
  own only its thin pointer and repository-local provenance.
- **R2 (ubiquitous):** Claude and Codex manifests shall declare one semantic
  plugin version and launch one bundled executable.
- **R3 (ubiquitous):** Installation and startup shall require no global Wisp,
  daemon, lifecycle script, registry access, or project dependency.
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
- **R13 (ubiquitous):** The MCP server shall expose exactly the six specified
  tools and no command-issuance capability.
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
- **R23 (ubiquitous):** All six MCP handlers shall call the shared runtime
  operations and constants.
- **R24 (ubiquitous):** The plugin bundle shall expose no CLI entrypoint,
  binary declaration, or CLI command dispatch.
- **R25 (ubiquitous):** The plugin payload shall contain exactly the seven
  specified release paths, with Claude's server in root `.mcp.json` and
  Codex's server inline in its manifest.
- **R26 (ubiquitous):** The skill shall contain portable policy only and shall
  delegate mechanics to MCP.
- **R27 (ubiquitous):** Multiple project processes shall not share a default
  bus or machine-wide daemon.
- **R28 (ubiquitous):** A release shall pass clean-bundle tests on the latest
  patch of Node 20.x, 22.x, and 24.x and record each exact version and result.
- **R29 (ubiquitous):** A release shall independently pass current-stable
  Claude Code and Codex manifest, install, launch, tool-list, check, write,
  and exact-bus-path tests.
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
  including each Node line's version/result object, may remain `pending`
  during development, and shall be overall `pass` before release.
- **R35 (unwanted behavior):** If a requested run contains duplicate command
  ids, `wisp_check` shall return `command_conflict` for the first duplicated
  id in append order with its count and no partial data.
- **R36 (ubiquitous):** Every stored event shall satisfy the complete
  canonical version, timestamp, identifier, kind, field, null, unknown-field,
  nested-body, payload, and size contract before participating in reduction.
- **R37 (ubiquitous):** Codex shall omit MCP `cwd`, bind the host-selected
  session directory before import, resolve the bundle from the version-matched
  `kodhama/wisp` Codex cache entry, and accept no model-supplied project path.

## Verification matrix

| Contract area | Minimum evidence |
|---|---|
| Constants and schemas | Generated-schema snapshot plus table-driven at-limit/over-limit tests for every fixed value, all six tools, all six stored-event kinds, exact timestamp/version, null/unknown rejection, and recursively arbitrary command-payload JSON |
| Resolution | Table-driven tests for environment root, capability absence, list failure/timeout, counts, URI validity, realpath, no-I/O, and memoization; Codex host smoke verifies session-cwd binding |
| Filesystem | Temp-project tests for missing read, first-write creation, lstat/symlink/type/containment rejection, one-line append, fatal UTF-8, LF/CR/final-segment/blank handling, limits, and no truncation |
| Runtime boundary | Spies or dependency injection prove all six MCP handlers call shared operations |
| Command safety | Append-order tests prove issued fields, whole-check first-duplicate conflict/count/no-partial-data, ack duplicate conflict, unique-id-only reduction, same-run/following-ack filtering, last-ack wins, stable ordering, no execution, and every acknowledgement result |
| Errors | Contract snapshots for all code/reason/JSON-pointer/detail shapes, parse reasons, `isError`, `-32601`, `-32602`, and unexpected-exception containment |
| Stdio | Spawned-process transcript proves all stdout is MCP framing and diagnostics are stderr-only |
| Import safety | Isolated import probes for every reusable module |
| Bundle | Clean fixtures with no global Wisp or dependency tree launch the exact distributed artifact on recorded Node 20, 22, and 24 patches |
| Claude | Validate exact `.mcp.json`; installed current-stable smoke lists tools, checks, writes, and verifies fixture `.wisp/events.ndjson` |
| Codex | Separately validate the manifest's one inline bootstrap, absent `cwd`, forwarded `CODEX_HOME`, exact marketplace/plugin/version cache path, and absence of a custom config path; install through marketplace `kodhama`, then smoke lists tools, checks, writes, and verifies fixture `.wisp/events.ndjson` |
| Plugin contents | Exact seven-path inventory, equal manifest versions, no CLI/binary, portable-skill static checks, bundle SHA-256, and exact qualification schema/state rules including all three Node version/result objects |
| Marketplace | Stewards fixture resolves exactly to `kodhama/wisp:plugins/wisp` and contains no implementation/version copy |

## Rubric check

The configured `SPEC_RUBRIC_PATH` says no dedicated rubric exists, so this
check uses `specs/README.md`.

- **Frontmatter:** PASS — all required fields are present; `version: 5`
  records the externally required Codex host-contract correction.
- **Approved dependency:** PASS — ADR-0004 is approved and records the
  source-verified Codex adapter correction.
- **Testable acceptance criteria:** PASS — S1–S30 and S3a are GWT scenarios,
  R1–R37 are EARS requirements, and the matrix names executable evidence.
- **Exactness:** PASS — all six schemas, outputs, error mapping, project
  selection, stored-event validity, confinement/decoding, duplicate/unique
  command reduction, first-write behavior, finite limits, seven payload paths,
  root-Claude/inline-Codex launch definitions, per-Node qualification schema,
  and Node/host release policy are fixed rather than deferred.
- **Open questions:** PASS — the required section is present below.
- **Scope fidelity:** PASS — the MCP-only plugin distribution, dual-host
  evidence, project isolation, skill boundary, and Stewards pointer derive
  from ADR-0002; superseded CLI/legacy behavior is absent.

Result: **PASS**. The spec remains `gated` for independent convergence review.

## Open questions

None.
