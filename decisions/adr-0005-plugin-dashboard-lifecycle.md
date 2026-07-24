---
id: adr-0005-plugin-dashboard-lifecycle
type: adr
status: gated
depends_on:
  - adr-0002-plugin-mcp-distribution
  - adr-0004-codex-session-bootstrap
owner: human
updated: 2026-07-24
---

# ADR-0005 — Add an explicit, project-singleton dashboard to the Wisp plugin

## Decision state

### Decided

- Wisp remains one self-contained, user-level plugin for both Claude Code and
  Codex. A separate CLI is not required for this release.
- Each host session keeps its own project-bound stdio MCP process and all
  sessions for one canonical project continue to share that project's
  `.wisp/events.ndjson` bus.
- The dashboard starts only after an explicit user request. Loading the plugin
  or starting an MCP session does not start an HTTP listener.
- Concurrent requests from Claude Code and Codex for the same canonical
  project and OS user converge on one dashboard instance.
- The plugin carries the dashboard implementation and a dedicated skill for
  opening it. Neither host needs project MCP configuration beyond the plugin.
- The first bundled dashboard remains command-capable. Its writes pass through
  the same validation, authorization, locking, and append path as MCP bus
  operations.

These are the concrete constraints selected by the maintainer during the
2026-07-24 shaping conversation. Their recording here is not intent
ratification; this ADR remains subject to the repository's human intent gate.

### Open

- None at the intent layer. Exact registry fields, error envelopes, health
  schema, timeouts, and test vectors belong in the downstream specification.

### Parked

- An optional Wisp CLI and configuration guidance for generic MCP harnesses,
  tracked in [issue #26](https://github.com/kodhama/wisp/issues/26).
- Remote MCP transport, remotely hosted dashboards, and multi-user service
  operation.
- A detached or machine-wide Wisp daemon.

## Context

ADR-0002 chose a dual-host plugin containing a bundled stdio MCP server. It
also deliberately excluded the repository's legacy CLI and HTTP dashboard
from that release surface. ADR-0004 later corrected Codex project binding
without changing the session-scoped process model.

That model creates one MCP process per enabled host session, not one process
per project. Automatically starting an HTTP server from each process would
therefore create unused listeners and races whenever a user has several
Claude Code or Codex sessions open for the same project. Sharing one MCP
process would require a separate broker or daemon and would work against the
hosts' stdio lifecycle.

The repository's existing dashboard server is not a suitable plugin payload.
It targets the legacy `.grove` runtime, uses a fixed port, exposes an
unauthenticated command endpoint, starts as a standalone process, and writes a
startup banner to stdout. Reusing it unchanged would violate the current bus,
security, and MCP stdout contracts.

The useful boundary is therefore:

- stdio MCP remains session-scoped and host-managed;
- the bus remains project-scoped;
- the dashboard is created lazily and is singleton-scoped to one canonical
  project and OS user; and
- whichever MCP process wins startup owns the dashboard listener for as long
  as that process remains connected.

## Decision

### Plugin surface

The plugin SHALL add a seventh MCP tool, `wisp_dashboard`. It takes no project
path. It uses the MCP process's already resolved, immutable canonical project
and returns a stable success envelope containing at least the dashboard URL
and whether an existing instance was reused.

The tool SHALL NOT open a browser, invoke a shell command, detach a child
process, or print the URL to MCP stdout outside protocol framing.

The plugin SHALL also carry a dedicated dashboard skill. On an explicit
request such as “open”, “show”, or “start the Wisp dashboard”, the skill calls
`wisp_dashboard` and presents the returned link. It SHALL NOT manufacture a
URL or start the legacy server. The existing lifecycle-reporting skill remains
focused on lifecycle policy.

Plugin installation and ordinary session startup remain side-effect free:
before the first explicit `wisp_dashboard` call, no dashboard listener or
dashboard discovery record exists.

### Ownership and singleton coordination

Each Claude Code or Codex session continues to own its stdio MCP process.
There is no shared MCP daemon. The MCP process that successfully creates the
dashboard listener becomes its owner; the listener is an in-process component
of that same bundled artifact.

Dashboard discovery state SHALL live below one deterministic Wisp user-runtime
root, keyed by a collision-resistant digest of the canonical project path.
Every bundled Claude Code and Codex entrypoint SHALL call the same resolver:
the root is `<OS user home>/.wisp/runtime/dashboard`, derived from Node's
canonical OS-user home lookup rather than process working directory,
host-specific plugin storage, `TMPDIR`, or host-specific environment
substitutions. The resolver and its platform test vectors SHALL be part of the
shared runtime contract.

The root and all state below it SHALL be private to that OS user. On platforms
with numeric ownership and mode bits, Wisp verifies the expected owner and
requires directories and files no broader than `0700` and `0600`
respectively. Other platforms require an equivalently qualified,
platform-native same-user boundary. If the home, ownership, type, or
permissions cannot be established safely, dashboard startup fails closed.
A release makes no platform-support claim until that resolver and boundary
have passed live qualification there.

Discovery SHALL NOT live in the project tree. This lets Claude Code and Codex
sessions owned by the same OS user discover one another without adding
tokens, ports, or process metadata to the project. The canonical bus remains
`<project>/.wisp/events.ndjson`. After canonicalizing both locations, Wisp
SHALL fail dashboard startup if the canonical project is equal to or contains
the user-runtime root. This intentionally makes the dashboard unavailable
when a session selects the OS home or another ancestor of the runtime root;
MCP bus tools remain unaffected. Wisp SHALL NOT silently choose a second
rendezvous location because doing so could split Claude Code and Codex into
different singleton domains.

Startup SHALL use an atomic owner directory, an instance nonce, and a recheck:

1. Read and authenticate the registered instance.
2. If its health endpoint proves that it is live, protocol-compatible, and
   bound to the same canonical project, return its URL.
3. Otherwise acquire the project-keyed startup ownership directory below the
   Wisp user-runtime root.
4. Recheck after acquiring ownership.
5. If there is still no valid owner, bind a new listener to `127.0.0.1` on an
   OS-assigned port and atomically publish its discovery record.
6. Mark startup complete and return the URL.

A live compatible owner is reused and never stolen. A live incompatible owner
produces a stable version-conflict error rather than a second dashboard.
An unhealthy owner whose process is still live also produces a stable error;
health failure alone never authorizes a second listener.

The ownership record SHALL contain enough process and nonce evidence to
distinguish a live startup, an abandoned startup, and a reused process id.
Contenders wait only for a bounded interval. They may atomically quarantine
and replace an incomplete or malformed owner directory only after proving
that its recorded process is no longer the recorded process instance. If
liveness or identity cannot be proved, startup fails closed. A process that
binds a listener but fails to publish a complete record closes that listener
before releasing ownership; process death provides the final rollback.

During an owner-stable interval, concurrent calls for the same OS user and
canonical project SHALL converge on one URL. A tool result proves that the
instance was healthy immediately before return; it does not lease the owning
session or promise that the URL survives return. During owner shutdown or
takeover, callers may receive a stable transient error and retry explicitly,
but two live owners are never an allowed recovery strategy. Calls for
different canonical projects SHALL remain isolated even when their directory
names are identical.

### Lifecycle and recovery

The dashboard listener SHALL NOT keep its owning MCP process alive after the
stdio transport closes. On graceful transport shutdown, `SIGINT`, or
`SIGTERM`, the owner closes the listener and removes its discovery record only
if that record still names its own instance.

After an abrupt owner death, the ownership directory may remain stale. The
next explicit `wisp_dashboard` call health-checks it, proves the recorded
process instance is gone, atomically quarantines the abandoned directory, and
creates a replacement. The same recovery applies if the owner dies before
publishing its listener. Wisp does not install a background supervisor.

An already open browser page becomes unavailable when its owning MCP session
ends. The user can explicitly open the dashboard again from any remaining
session. This tradeoff is preferred to an orphaned detached server or
machine-wide daemon.

### Dashboard runtime and commands

The plugin SHALL carry a self-contained dashboard UI and HTTP implementation.
It SHALL use the same reusable project resolver, version-1 event parser,
command reduction, validation limits, symlink defenses, locking, and atomic
append implementation as the MCP tools. It SHALL NOT import or bundle the
legacy `.grove` dashboard runtime as its data plane.

Dashboard command submission remains a human action. Valid commands are
appended to the canonical project bus and later surfaced by `wisp_check`;
Wisp never executes a command. Invalid or unauthorized submissions do not
write to the bus.

Reusable module imports remain side-effect free. Only an explicit
`wisp_dashboard` tool call may create the HTTP listener.

### Local HTTP security boundary

The dashboard is local-only, not unauthenticated:

- bind IPv4 loopback explicitly and use an OS-assigned port;
- generate a high-entropy per-instance capability;
- require that capability for every data, health-proof, and mutation request;
- keep the capability out of query strings and HTTP logs; a URL fragment may
  bootstrap an in-memory authorization header in the dashboard client;
- reject unexpected `Host` and `Origin` values and emit no permissive CORS
  headers;
- apply a restrictive Content Security Policy, `Cache-Control: no-store`,
  exact method and content-type checks, and bounded request bodies;
- create discovery and ownership state with user-private permissions, reject
  symlinks and wrong filesystem types, and avoid exposing capability material
  through tool errors or diagnostics; and
- preserve protocol-only MCP stdout, with diagnostics on stderr.

The capability is a defense against cross-user access, hostile web origins,
DNS rebinding, accidental unauthenticated local requests, and confusion with
an unrelated or stale loopback service. It does not protect against a
compromised Claude Code or Codex host, a malicious process already running as
the same OS user, or a person to whom the user shares the capability-bearing
tool result or transcript. Those are trusted or explicitly accepted
boundaries for this local plugin.

The URL necessarily appears in the MCP result and in the conversation when
the dashboard skill presents it. Other logs, stderr diagnostics, errors,
health responses, and analytics SHALL redact the capability. The user-private
discovery record is the only cross-process exchange. The capability rotates
on every new owner generation, expires when that owner closes, and is removed
from the browser location after transfer to session-only memory. A stale
capability cannot authenticate to a replacement owner.

The downstream specification SHALL define the capability exchange and health
proof precisely enough that a stale or unrelated loopback process cannot be
mistaken for the registered Wisp instance.

### Qualification

The plugin remains a dual-host release. Qualification SHALL demonstrate:

- no listener before an explicit tool call;
- one URL and one listener under concurrent calls from multiple Claude Code
  and Codex sessions during an owner-stable interval, plus stable transient
  failure rather than duplication during owner shutdown;
- isolation between different canonical projects;
- reuse of a live owner, recovery from a dead owner or abandoned startup, and
  refusal to steal from a live incompatible or unhealthy owner;
- fault injection before ownership acquisition and after ownership, bind,
  publish, and completion, proving bounded recovery and no
  bound-but-unpublished survivor;
- owner cleanup on transport close without a surviving daemon;
- the same deterministic user-runtime root from Claude Code and Codex, with
  rejection of unsafe ownership, permissions, symlinks, or filesystem types;
- refusal to start a dashboard when the project contains the user-runtime
  root, without affecting ordinary MCP bus tools;
- authenticated read and command paths, capability rotation and redaction,
  plus rejection of missing capabilities, hostile `Host`/`Origin`, oversized
  bodies, wrong content types, and symlinked runtime state;
- exact reads and command appends against the selected project's
  `.wisp/events.ndjson`; and
- the existing Node.js support matrix and independent live qualification on
  both Claude Code and Codex.

Passing one host remains no evidence for the other.

## Consequences

- One marketplace installation contains MCP, dashboard, and interaction
  policy for both supported hosts.
- Normal sessions pay no listener or port cost until a user asks for the
  dashboard.
- Several session-scoped MCP processes can share one project dashboard without
  adding a broker or daemon.
- Dashboard lifetime is intentionally tied to one host session, so an open
  page can disappear when that session ends.
- A private discovery protocol and authenticated local HTTP surface add
  implementation and security work, but keep the project tree free of
  credentials and process metadata.
- A project rooted at the OS home or another ancestor of the runtime directory
  cannot start the dashboard; selecting a narrower project restores it.
- The exact six-tool, seven-path, and “stdio server only” portions of ADR-0002
  will be superseded if this decision is approved. Its plugin-only delivery,
  project isolation, session-scoped MCP, no-CLI, no-daemon, and stdout-purity
  decisions remain in force.

## Rejected alternatives

### Start one dashboard for every MCP session

Rejected because most listeners would be unused and simultaneous sessions
would race or expose multiple dashboard URLs for one project.

### Share one MCP process per project

Rejected because Claude Code and Codex own their stdio server processes.
Sharing one would require an additional broker or daemon and a second
connection protocol.

### Detach the dashboard from MCP

Rejected because a detached process creates orphan detection, upgrade,
cleanup, and trust problems. A supervised standalone mode belongs with the
parked CLI work.

### Store dashboard discovery in the project

Rejected because capability material, ports, and process identity are
per-user runtime state, not project state. Project-local discovery would also
inherit project-directory permissions and risk being copied, indexed, or
shared.

### Use a fixed port

Rejected because it conflicts across projects, users, and unrelated local
services. Discovery makes an OS-assigned port practical.

### Accept a project path in `wisp_dashboard`

Rejected because it would bypass the host-selected, immutable project
authority boundary and reintroduce per-call retargeting.

### Ship a read-only dashboard

Rejected because the existing dashboard's principal interaction—issuing
pause, steer, resume, or gate commands—would disappear. Authenticated,
validated appends preserve that capability without giving Wisp command
execution authority.

### Ship the legacy dashboard unchanged

Rejected because it targets the wrong runtime and does not meet the plugin's
lifecycle, isolation, stdout, or security requirements.

### Implement the CLI in this change

Rejected because generic harnesses and a supervised standalone lifecycle have
different distribution and ownership questions and are already parked in
issue #26.

## Self-check

- **Usefulness:** one explicit action gives Claude Code and Codex users the
  dashboard for the project already selected by their host.
- **Capability:** the bundled runtime can implement the UI, HTTP listener,
  authenticated commands, and project bus access without a second install.
- **Usability:** the common path is “open Wisp dashboard”; no port, path, or
  MCP configuration is requested from the user.
- **Manageability:** session ownership, discovery, locking, compatibility,
  cleanup, abandoned-startup recovery, and shutdown races are explicit.
- **Coherence:** session-scoped stdio MCP and project-scoped bus decisions are
  preserved; only the HTTP prohibition and exact payload/tool counts change.
- **Efficiency:** startup is lazy and reuse avoids one listener per session.
- **Security:** the HTTP and filesystem boundaries are fail-closed and subject
  to explicit adversarial qualification, and the capability's trusted and
  untrusted boundaries are stated.
