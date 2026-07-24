---
id: adr-0004-codex-session-bootstrap
type: adr
status: approved
depends_on: [adr-0002-plugin-mcp-distribution]
owner: human
updated: 2026-07-24
---

# ADR-0004 — Bind Codex Wisp to the host-selected session directory

> **Forward pointer.**
> `adr-0006-family-plugin-release-and-surface-contract` keeps the bootstrap
> cache segment equal to the manifest version, but both become derived carriers
> of root `package.json` rather than independently maintained release values.

## Decision state

### Decided

- ADR-0002's self-contained, dual-host, user-installed plugin direction
  remains in force.
- Claude continues to bind through `CLAUDE_PROJECT_DIR`.
- Codex launches a small inline bootstrap from its host-selected session
  directory. The bootstrap sets `WISP_PROJECT_ROOT` to that directory before
  importing the installed Wisp bundle.
- The bootstrap resolves the bundle from Codex's documented plugin cache
  layout using marketplace `kodhama`, plugin `wisp`, and the manifest version.
  It honors `CODEX_HOME` when present and otherwise uses the default
  `.codex` directory under the user's home.
- The Codex MCP definition omits `cwd`, forwards `CODEX_HOME`, and performs no
  install, fetch, daemon startup, or project write before a Wisp tool call.
- MCP roots remain a generic runtime fallback for clients that advertise
  them. They are not the Codex binding contract.

### Superseded

ADR-0002's claim that current Codex binds Wisp through MCP roots.

## Context

Live qualification against Codex CLI 0.145.0 disproved the earlier host
assumption. Codex loaded the plugin and listed the server, but its MCP
initialization advertised no roots capability. Its initialize and tool-call
messages also carried no project path. Codex did not expand `PLUGIN_ROOT` in
MCP arguments or environment values.

The Codex source and a local process probe established the usable host
contract instead: when an stdio MCP definition omits `cwd`, Codex launches it
from the session's local stdio fallback directory. That directory is selected
from the active turn environment, falling back to the configured session cwd.
When `cwd` is relative, Codex instead resolves it under the plugin root.

Using a model-supplied tool argument as the project root was rejected during
review. The MCP subprocess is not the model's filesystem sandbox, so an
arbitrary absolute path would grant the tool authority outside the active
workspace. Forwarding shell `PWD` was also rejected because a GUI-launched
host need not carry the thread directory in its process environment.

The maintainer's ratified priorities remain a single user install, dual
Claude/Codex distribution, and minimal project friction. A host-selected
bootstrap meets those constraints without a second CLI install or project
configuration.

## Decision

Codex's inline `mcpServers.wisp` definition SHALL:

1. launch host-provided `node` with `-e`;
2. omit `cwd`, preserving Codex's active session directory as
   `process.cwd()`;
3. set `WISP_PROJECT_ROOT` to that directory before loading Wisp;
4. resolve the installed bundle under
   `<codex-home>/plugins/cache/kodhama/wisp/<plugin-version>/dist/wisp.mjs`;
5. derive `<codex-home>` from forwarded `CODEX_HOME`, or from
   `<user-home>/.codex` when absent;
6. import the bundle by file URL; and
7. write bootstrap failures to stderr only.

The manifest version and cache-path version SHALL match. Qualification SHALL
install the exact candidate through a marketplace named `kodhama`, so the
installed path and launch contract are exercised rather than simulated.

The runtime continues to validate and canonicalize `WISP_PROJECT_ROOT` before
bus I/O. Tool inputs remain path-free, process cwd remains outside the generic
runtime resolver, and the selected project remains immutable after first
resolution.

## Consequences

- Codex works without MCP roots, project files, user configuration, or a
  separately installed Wisp executable.
- The authority boundary comes from Codex's session selection, not
  model-supplied data.
- The Codex adapter is intentionally coupled to the published marketplace
  name and Codex's documented cache layout.
- A plugin version change must update the manifest version and bootstrap cache
  segment together; static tests enforce this.
- A future Codex-native plugin-root or project-root substitution may replace
  the bootstrap after independent qualification.

## Rejected alternatives

### Model-supplied project path

Rejected because canonicalization proves identity, not authorization, and the
MCP subprocess can outlive the model sandbox boundary.

### Forwarded `PWD`

Rejected because it works in the CLI but is not a reliable active-thread
contract for GUI-launched hosts.

### MCP roots

Rejected as the Codex adapter because current Codex does not advertise them.
Retained as a generic fallback for conforming clients.

### Global Wisp CLI or per-project MCP configuration

Rejected because either adds a second install channel or repeats setup in
every project.

### Embedding the complete server in the manifest

Rejected because it duplicates the bundle and makes versioning, review, and
platform command-length limits worse.

## Acceptance criteria

- Current stable Codex launches the installed Wisp plugin from a fixture and
  lists exactly the six tools.
- `wisp_check` and one write target only the fixture's
  `.wisp/events.ndjson`.
- The fixture contains no Wisp project configuration or dependencies.
- The Codex manifest has no `cwd`, per-call project path, global `wisp`,
  `npm`, `npx`, fetch, or daemon dependency.
- A mismatched manifest/cache version fails static validation.

## Open questions

None.
