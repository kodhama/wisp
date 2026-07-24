---
id: adr-0006-codex-e2e-testing
type: adr
status: draft
depends_on:
  - adr-0004-codex-session-bootstrap
  - adr-0005-plugin-dashboard-lifecycle
owner: agent
updated: 2026-07-24
---

# ADR-0006 — Establish reproducible Codex end-to-end testing

## Decision state

### Decided

- Codex end-to-end evidence must be repeatable in CI and locally; a maintainer
  smoke test alone is insufficient.
- Claude end-to-end qualification remains deferred to [issue #25](https://github.com/kodhama/wisp/issues/25).
- The strategy must exercise the installed plugin boundary, Codex's
  host-selected project binding, the MCP tools, and the authenticated dashboard
  over HTTP.
- The strategy must not put a paid, prompt-driven model run or user credentials
  in ordinary pull-request CI.

### Open

- Whether the proposed deterministic adapter/browser lane and separate real
  Codex canary are the right release boundary.

### Parked

- Claude and cross-host dashboard qualification: [issue #25](https://github.com/kodhama/wisp/issues/25).
- Windows process-identity support: [issue #29](https://github.com/kodhama/wisp/issues/29).

## Context

Wisp 0.2.0 has strong unit and integration coverage plus one live Codex
qualification. That proves the implementation works on one machine, but it is
not yet a reproducible installed-plugin test lane. The Codex adapter has
meaningful host behavior: Codex launches the inline MCP definition from the
selected project directory, while Wisp resolves the installed bundle from the
versioned plugin cache.

The dashboard is also an HTTP surface. Its owner, capability, lifetime, and
project-bus behavior should be verified from the perspective of a browser,
not only by HTTP unit tests.

The repository already launches the literal inline Codex manifest from a
staged `<CODEX_HOME>/plugins/cache/kodhama/wisp/<version>` fixture through an
MCP SDK client. It verifies seven tool definitions, check/write behavior,
session-CWD project binding, configured and default `CODEX_HOME`, and the
missing-bundle failure. The existing dashboard tests launch real stdio MCP
processes and cover singleton, authenticated HTTP, command writes, isolation,
and cleanup. Neither suite renders the UI in a browser.

`codex exec` is not a deterministic MCP invocation client: it accepts a
natural-language prompt and relies on a model to select tools. It therefore
requires authenticated model access, has a cost, and cannot be a stable
pull-request gate. A browser container likewise cannot reproduce Codex's
native plugin lifecycle; it can reproduce the published adapter contract and
browser surface.

## Proposed decision

### Deterministic pull-request gate

Add a single Linux Codex-adapter/browser E2E lane to CI. It SHALL run the
release candidate in a pinned Playwright image with an ephemeral `HOME` and
`CODEX_HOME`, never the runner's real Codex state or credentials.

The test SHALL stage exactly the eight release payload paths at the same
versioned cache location used by the Codex manifest, then launch the literal
manifest `command` and `args` from a fixture project working directory. A
direct MCP SDK client is the test driver for this layer because it makes tool
calls deterministic while preserving the real subprocess, cache, and
host-selected-CWD boundary.

The browser part SHALL use Playwright Chromium against the URL returned by
`wisp_dashboard` and prove at least:

- no listener or runtime owner exists before the explicit dashboard tool call;
- two staged Codex adapter processes for one project converge on one URL;
- a second project is isolated;
- the page renders lifecycle, timeline, command, and parse-error sections from
  the canonical bus;
- an authenticated UI command appends the canonical event and its rendered
  state converges;
- the URL fragment capability is not sent as a request query, unauthorized or
  cross-origin requests fail, and the UI initiates no external requests; and
- closing the owner transport removes only its owner record and a new session
  can recover.

Run the browser, MCP children, and dashboard in the same container network
namespace. The dashboard deliberately binds `127.0.0.1`; splitting browser
and server across Compose services would test a different network model or
require fragile namespace sharing. Docker is the local/CI parity mechanism;
Docker Compose is not required for this single-process topology. An optional
one-service Compose wrapper may be added later solely as a familiar local
command, not as a second test architecture.

The default CI matrix SHALL keep the fast typecheck/unit/build/plugin tests on
Node 20, 22, and 24. The browser E2E lane runs once on the pinned image and
blocks pull requests. Its image version/digest and Playwright package version
must be locked together. `npm run test:e2e` runs the same test directly for
contributors; `npm run test:e2e:container` runs the pinned container image for
CI-equivalent local reproduction.

### Real-host release canary

Add a separate manual or scheduled Codex release canary. It SHALL install the
exact marketplace candidate with an isolated `CODEX_HOME`, run current Codex
CLI against a clean fixture, preserve its JSON transcript and host versions,
and verify tool listing, check, write, exact bus path, and explicit dashboard
open. It may use an authenticated model run because it is release evidence,
not pull-request CI.

The canary is non-blocking while its host dependency is unavailable, but a
release cannot claim full Codex qualification without its recorded evidence.
It does not replace macOS host qualification: Linux container coverage uses
the `/proc` identity provider, while macOS uses `/bin/ps` and remains a local
or release-host check.

## Rejected alternatives

- **Playwright/Docker as the entire Codex e2e claim:** rejected because it
  cannot exercise Codex's authenticated, prompt-driven host behavior.
- **`codex exec` on every pull request:** rejected because the tool selection
  is model-mediated, credentials are required, and runs are paid and
  nondeterministic.
- **Multi-service Docker Compose topology:** rejected because the browser and
  loopback-only dashboard would occupy different network namespaces without
  improving adapter fidelity.
- **Browser-only UI smoke tests:** rejected because they bypass the Codex
  manifest/cache/CWD boundary that selects Wisp's project bus.

## Consequences

- Pull requests gain a reproducible browser-facing E2E gate without Codex user
  credentials or a model call.
- The suite gains a Playwright development dependency and a pinned container
  image, with one heavier browser job in addition to the Node matrix.
- Release operations retain a small real-Codex canary and an evidence record;
  failures distinguish adapter/browser regressions from host/plugin-marketplace
  regressions.

## Open questions

- Should the real Codex canary be required before each marketplace release, or
  scheduled nightly with release owners reviewing the latest successful record?
