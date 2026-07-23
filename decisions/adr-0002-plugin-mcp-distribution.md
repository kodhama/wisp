---
id: adr-0002-plugin-mcp-distribution
type: adr
status: approved
depends_on: []
owner: human
updated: 2026-07-23
---

# ADR-0002 — Distribute Wisp as a dual-host plugin with a bundled stdio MCP server

## Decision state

### Decided

- Wisp ships as one self-contained, user-installed plugin owned by
  `kodhama/wisp`; `kodhama/stewards` owns only its marketplace pointer.
- The same plugin carries separately qualified Claude and Codex manifests and
  launches the same bundled stdio MCP implementation.
- One installation serves multiple projects. Each host session starts a
  lightweight project-bound process; Wisp installs no machine-wide daemon.
- MCP is the only executable interface in this plugin release. Legacy source
  may remain elsewhere in the repository, but the plugin bundle exposes no CLI.
- A normal host session needs no Wisp configuration: Claude supplies its
  project substitution, while a host with exactly one file workspace can use
  MCP roots.

### Human ratification and amendment

The maintainer selected and ratified the self-contained plugin direction on
2026-07-23 with “Do it all then” and required the dual Claude/Codex
distribution. On the same date, the maintainer explicitly amended the
compatibility priority:

- “you don't need to keep anything from legacy if it's not useful. I literally
  just want it to work in the best way possible.”
- “Feel free to amend specs as needed and supersede any decisions. We want
  minimal friction for people using it.”

Those statements supersede this ADR's earlier broad compatibility clause, its
earlier direct-CLI path contract, and the first amendment's attempt to retain
a thin CLI. Existing protocol concepts may be reused where useful, but the
release surface is the coherent zero-configuration plugin/MCP experience.

### Parked

- Remote Streamable HTTP transport, authentication, and multi-tenant hosting.
- npm or Homebrew publication as independent delivery channels.
- OpenTelemetry and CloudEvents adapters.

## Context

The repository started with a TypeScript emitter whose argument parsing ran on
module import, whose default bus depended on process working directory, and
whose package had no distributable executable. A marketplace definition that
only referenced that emitter or a separately installed global CLI would
require two installation channels, depend on `PATH`, and allow plugin/runtime
version drift.

Stewards already provides a thin marketplace catalog whose product entries
point into product repositories. Claude and Codex can both launch
plugin-bundled local MCP servers, but their manifest and launch-path contracts
differ. Wisp therefore needs one product-owned payload with separate host
definitions and independent host evidence.

The existing HTTP command endpoint is not promoted into the agent interface.
The separate draft ADR-0001 concerns telemetry framing; this decision neither
depends on nor ratifies it.

## Decision

### Ownership and distribution

Wisp SHALL own `plugins/wisp/`, containing exactly these seven release
payload paths:

- `.claude-plugin/plugin.json`;
- `.codex-plugin/plugin.json`;
- `.mcp.json`;
- `dist/wisp.mjs`;
- `skills/wisp/SKILL.md`;
- `README.md`; and
- `qualification.json`.

Both manifests SHALL declare the same semantic version. Stewards SHALL carry
only its own decision/provenance and a `git-subdir` entry targeting
`kodhama/wisp`, path `plugins/wisp`; it SHALL NOT copy or independently version
the implementation.

Claude SHALL launch `node ${CLAUDE_PLUGIN_ROOT}/dist/wisp.mjs` from
`.mcp.json` and set `WISP_PROJECT_ROOT=${CLAUDE_PROJECT_DIR}` using Claude's
plugin substitution. Codex SHALL declare its one `wisp` MCP server inline in
`.codex-plugin/plugin.json`, launching `node ./dist/wisp.mjs` with
plugin-root cwd `.`; Codex uses MCP roots for project binding unless its
supported host contract later provides a qualified project-root environment
substitution.

This inline Codex definition is a source-driven correction: primary Codex
manifest validation proved that a custom `./mcp/codex.json` reference is not a
valid plugin contract, while inline `mcpServers` is. No other runtime or host
behavior changes.

Plugin installation and session startup SHALL NOT fetch runtime dependencies,
run package lifecycle scripts, invoke `npm`/`npx`, require a global `wisp`,
resolve project dependencies, or start a daemon. Both hosts MAY resolve the
host-provided `node` runtime from `PATH`.

### Primary MCP experience

The plugin's primary agent surface is a stdio MCP server. It exposes exactly:

1. `wisp_status`
2. `wisp_heartbeat`
3. `wisp_verdict`
4. `wisp_question`
5. `wisp_check`
6. `wisp_ack`

Human command issuance is not an MCP tool. Checking returns pending commands
and malformed-line evidence as data; Wisp never executes a command.
Acknowledgement is allowed only for an existing pending command addressed to
the acknowledging agent or `*`.

The server SHALL use stable success and error envelopes, explicit schemas, one
shared finite-limit policy, and stdout only for MCP protocol traffic.
Diagnostics use stderr.

### Project and bus selection

The project target is resolved once per MCP process before its first bus
operation and then remains immutable:

1. A non-empty `WISP_PROJECT_ROOT` launch value selects the project only if it
   is absolute and resolves to an existing directory.
2. Otherwise the server requests MCP roots. Exactly one root entry, using a
   local `file://` URI that resolves to an existing directory, selects the
   project.

The common one-workspace case is therefore zero-configuration. An invalid
explicit root never falls through. If the client did not advertise roots,
`roots/list` fails, the response has zero or multiple entries, or its sole
entry is not a valid local file directory, every bus tool returns a
configuration error without bus I/O. Process working directory and per-call
path arguments never select an MCP project.

The selected directory is canonicalized once. Its bus is
`<project>/.wisp/events.ndjson`. Wisp rejects a pre-existing `.wisp` or bus
symlink and any wrong filesystem type, and verifies the resolved bus remains
contained by the canonical project. A missing bus reads as empty. The first
successful write creates `.wisp/` and atomically appends exactly one
newline-terminated JSON event. Filesystem failures are reported without
retargeting or falling back elsewhere.

### Shared runtime and MCP-only bundle

One reusable runtime owns validation, reads, appends, deterministic command
reduction, and acknowledgement authorization. The bundled entrypoint starts
the stdio MCP server only. Importing reusable modules SHALL NOT parse
arguments, start listeners, emit frames, or perform bus I/O.

Only fully valid version-1 bus events participate in reduction. Duplicate
command ids make a check fail as a whole for the first duplicated id in
append order; unique commands are reduced only by later same-run
acknowledgements.

Legacy repository CLI source is outside this release contract. The plugin
contains no CLI entrypoint, binary declaration, CLI command dispatch, or CLI
compatibility obligation.

### Skill boundary

MCP owns mechanics. The bundled skill owns only portable policy: report real
state transitions, heartbeat after meaningful silence, check at handoff
seams, and acknowledge handled commands. Grove-specific roles, verdict
grammars, and consumer truth claims remain with their consumers.

### Qualification policy

The distributed JavaScript supports Node.js 20.x, 22.x, and 24.x. A release
must build once and pass clean-bundle launch tests on the latest available
patch of each supported line.

Claude and Codex are separate release targets. A plugin version is releasable
only after:

- both manifests validate against their host's schema;
- the current stable Claude Code launches the installed plugin and lists the
  six tools;
- the current stable Codex CLI does the same independently;
- each host invokes `wisp_check` and one write in a single-project fixture and
  verifies the exact `.wisp/events.ndjson` bus; and
- `qualification.json` records the artifact digest, exact runtime/host
  versions, platform, architecture, each supported Node line's result,
  per-host evidence, and overall result.

Passing one host is no evidence for the other. Older host releases are not
implicitly supported; expanding that promise requires explicit qualification.

## Consequences

- One marketplace install includes the agent interface and implementation.
- The ordinary one-project session has no Wisp setup step.
- Multiple projects and sessions share an installed version but not an MCP
  process or bus target.
- The release surface is smaller: repository-era CLI behavior cannot create
  plugin ambiguity or compatibility burden.
- Wisp acquires build dependencies, while the shipped artifact remains
  self-contained.
- Remote service operation remains out of scope.

## Rejected alternatives

### Plugin config pointing to a global CLI

Rejected because it creates a second install, depends on `PATH`, and permits
version drift.

### Machine-wide daemon

Rejected because state is project-scoped and no singleton requirement exists.

### Skill invoking shell commands as the primary interface

Rejected because it duplicates validation, path selection, and error
interpretation across hosts.

### One nominally cross-host manifest

Rejected because the two hosts have distinct packaging and launch contracts.

### Shipping any CLI in this plugin release

Rejected by explicit maintainer direction: even a cleaned-up CLI adds an
additional public contract while the desired product is the low-friction
plugin/MCP experience.

## Acceptance criteria

- A Stewards marketplace install works without a prior Wisp CLI or project
  dependency install.
- Claude and Codex independently launch the same bundled server and observe
  exactly the six tools.
- A single-file-root session selects `<root>/.wisp/events.ndjson` without Wisp
  configuration.
- Unsupported, failed, absent, invalid, or ambiguous roots cause no bus I/O
  and return a stable configuration error.
- First write creates the project bus directory and file; a missing bus reads
  as empty.
- The plugin payload contains only the specified files and exposes no CLI.
- Human command issuance is absent from MCP and no MCP behavior executes a
  command.
- Stored-event validation and duplicate-command failure are deterministic and
  never yield partial command results.
- MCP stdout contains protocol traffic only.
- Each host qualification proves tool listing, `wisp_check`, one write, and
  the exact project bus path; release requires `qualification.json` result
  `pass`.

## Self-check

- **Internal coherence:** one product-owned bundle supplies two independently
  qualified host adapters, one MCP-only surface, and one shared runtime.
- **Standing-decision conflicts:** no approved local packaging decision
  conflicts. This amendment expressly supersedes earlier compatibility
  clauses in this same ADR; ADR-0001 remains draft and unconsumed.
- **Argument soundness:** the chosen shape removes the verified two-install
  and path-discovery failure modes and makes the common host-root path
  configuration-free.
- **Settled ground:** the maintainer's quoted 2026-07-23 directions ratify both
  the original distribution choice and the compatibility amendment.

## Open questions

None.
