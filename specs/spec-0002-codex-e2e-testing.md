---
id: spec-0002-codex-e2e-testing
type: spec
status: gated
depends_on:
  - adr-0006-codex-e2e-testing
  - spec-0001-plugin-mcp-distribution@v6
implements: adr-0006-codex-e2e-testing
owner: agent
updated: 2026-07-24
version: 1
---

# SPEC-0002 — Reproducible Codex adapter and dashboard E2E

## Scope

This specification defines two complementary Codex test layers:

1. one deterministic Linux pull-request gate that stages the candidate as an
   installed Codex plugin, drives its stdio MCP directly, and renders its
   authenticated dashboard with Playwright Chromium; and
2. one real-Codex canary that runs weekly against the marketplace release and
   by explicit dispatch against every marketplace release candidate.

The deterministic gate proves the published adapter, MCP, project binding,
bus, dashboard, and browser surface without credentials, model calls, or
external network access. The canary alone proves Codex CLI discovery,
installation, model-mediated tool use, and host-managed MCP lifecycle.
Claude remains outside scope and tracked by issue #25.

All Wisp behavior under test, including the exact eight-path plugin payload,
seven MCP tools, canonical bus, dashboard security, and ownership lifecycle,
is inherited from `spec-0001-plugin-mcp-distribution@v6` and is not redefined
here.

## Required repository surfaces

| Path | Contract |
|---|---|
| `test/e2e/codex-plugin.e2e.ts` | The single deterministic Playwright suite described below |
| `test/e2e/playwright.config.ts` | Chromium only; one worker; no retries; failure trace and screenshot |
| `test/e2e/Dockerfile` | Pinned official Playwright image by tag and digest; installs with `npm ci`, copies the candidate, and runs unprivileged |
| `scripts/run-e2e-container.mjs` | Shell-free Docker build/run driver; runs the image with `--network none`, an ephemeral home, and no host credential mounts |
| `scripts/codex-canary.mjs` | Real-host canary driver and evidence writer |
| `.github/workflows/ci.yml` | Existing Node 20/22/24 checks plus one required `codex-e2e` job |
| `.github/workflows/codex-canary.yml` | Weekly schedule and candidate `workflow_dispatch` |
| `package.json` | Exact scripts `test:e2e` and `test:e2e:container`, plus an exact Playwright development version |

The Playwright package version SHALL equal the semantic version in the
container image tag. The image SHALL also carry an immutable digest.
`npm run test:e2e` SHALL build Wisp and run the suite directly.
`npm run test:e2e:container` SHALL invoke only
`node scripts/run-e2e-container.mjs`; CI SHALL use that same command.
Compose SHALL NOT define a second topology. A future one-service wrapper may
delegate to this command without changing the test architecture.

## Deterministic pull-request gate

Each run SHALL create fresh fixture projects, `HOME`, and `CODEX_HOME`. It
SHALL build the candidate once, verify the source plugin has exactly the eight
release paths, and byte-copy those paths to:

```text
<CODEX_HOME>/plugins/cache/kodhama/wisp/<manifest-version>/
```

The suite SHALL read the staged Codex manifest and launch its literal
`mcpServers.wisp.command`, `args`, and declared environment from each fixture
project's working directory. It SHALL NOT rewrite the bootstrap or inject
`WISP_PROJECT_ROOT`. An MCP SDK stdio client SHALL initialize each child,
assert the exact seven tools, and make deterministic tool calls. Fixture
projects SHALL have no `node_modules`; the runtime SHALL not resolve a global
Wisp executable.

Chromium, every MCP child, and every dashboard listener SHALL run inside the
same container network namespace. Container execution SHALL disable external
networking while retaining loopback. The suite SHALL fail on any browser
request outside the returned loopback origin.

Before `wisp_dashboard`, the suite SHALL find neither the project owner record
nor a loopback listening socket owned by the MCP child. It SHALL then prove:

- two MCP children launched from one canonical project return the same URL,
  with the publisher reporting `reused: false` and the contender `true`;
- a child launched from a second project returns a distinct URL and bus;
- status, verdict, command/acknowledgement, and one malformed bus line appear
  in the rendered lifecycle, timeline, command-state, and parse-error views;
- a user-submitted `pause` command appends one canonical command and becomes
  visibly pending;
- browser requests contain no capability query, no external origin, and no
  fragment; unauthenticated API access returns `401`, and an authenticated
  cross-origin command returns `403`; and
- closing the publishing transport removes only its matching owner record,
  after which a fresh child obtains a healthy replacement URL.

Assertions SHALL use unique run-scoped sentinel values and observable MCP,
filesystem, HTTP, and DOM evidence. Fixed sleeps SHALL NOT determine success;
bounded polling SHALL wait on the relevant observable state. Cleanup SHALL
close clients, children, browser contexts, and listeners even after failure.

## Real Codex canary

`.github/workflows/codex-canary.yml` SHALL have exactly these modes:

- `schedule`: once per week, install current stable Codex CLI and the current
  `wisp@kodhama` marketplace release;
- `workflow_dispatch`: require candidate version, candidate bundle SHA-256,
  and candidate marketplace source/ref, then install that exact candidate.

Both modes SHALL use a fresh `CODEX_HOME` and fixture project. The driver
SHALL record `codex --version`, resolved plugin version, bundle SHA-256, and
the `codex exec --json` transcript. A nonce-bearing prompt SHALL require
`wisp_check`, one `wisp_status` write, and `wisp_dashboard`. Pass requires
structured transcript evidence that those tools actually ran, the nonce event
at the exact fixture bus, and authenticated dashboard health at the returned
URL. Model prose alone cannot satisfy an assertion.

The workflow SHALL upload, without printing it to the job log, an artifact
containing `codex.jsonl` and `evidence.json`. Evidence SHALL identify mode,
workflow run, git SHA, timestamps, exact host/plugin versions and bundle hash,
and a boolean for tools, check, write, bus path, dashboard call, and dashboard
health. The overall result is `pass`, `fail`, or `inconclusive`.

A weekly dependency, authentication, marketplace, or service outage SHALL be
`inconclusive`; a completed run with incorrect behavior SHALL be `fail`.
Neither result affects pull-request gates. A candidate run has no waiver:
anything other than `pass`, or any mismatch with its requested version/hash,
SHALL block that release. Release evidence SHALL link the successful
candidate workflow run. Canary credentials SHALL be unavailable to ordinary
pull-request jobs.

## Acceptance criteria

### Scenarios (Given/When/Then)

**S1 — CI-identical local gate**

- **Given** Docker and a clean checkout,
- **When** `npm run test:e2e:container` runs locally or in `codex-e2e`,
- **Then** both execute the same pinned, network-disabled image and the same
  Playwright command.

**S2 — Installed adapter boundary**

- **Given** the staged eight-path candidate and an empty fixture project,
- **When** the literal manifest bootstrap is launched from that project,
- **Then** the client lists seven tools and writes only to that project's
  canonical bus.

**S3 — Explicit singleton dashboard**

- **Given** two initialized children for one project,
- **When** neither has called `wisp_dashboard` and then both call it,
- **Then** no listener/owner exists before the calls and both calls converge
  on one healthy URL with exactly one publisher.

**S4 — Browser behavior and security**

- **Given** sentinel lifecycle, command, acknowledgement, and malformed-line
  evidence,
- **When** Chromium opens the returned URL and submits a pause command,
- **Then** all four views render correctly, the canonical command is appended,
  unauthorized/cross-origin requests fail, and no capability or external
  request leaves the origin.

**S5 — Isolation and recovery**

- **Given** dashboards for two fixture projects,
- **When** the first project's publishing transport closes,
- **Then** the second project remains unchanged and a fresh first-project
  child publishes a healthy replacement.

**S6 — Canary cadence and release identity**

- **Given** a weekly trigger or candidate dispatch,
- **When** the real Codex canary completes,
- **Then** it stores structured host/tool/bus/dashboard evidence, and only a
  `pass` for the exact candidate version and hash qualifies a release.

### Requirements (EARS)

- **R1 (ubiquitous):** The pull-request E2E gate shall require no Codex
  credentials, model call, or external runtime network.
- **R2 (ubiquitous):** Local CI-parity execution shall use the same container
  driver, pinned image, dependency lock, and test command as CI.
- **R3 (event-driven):** When the suite launches Wisp, it shall use the
  byte-staged plugin and literal Codex manifest from the fixture project cwd.
- **R4 (event-driven):** When browser E2E runs, it shall verify explicit
  startup, singleton reuse, project isolation, rendering, command append,
  security, cleanup, and recovery through observable boundaries.
- **R5 (event-driven):** When the scheduled canary cannot reach an external
  dependency, it shall record `inconclusive` without affecting pull requests.
- **R6 (state-driven):** While a candidate lacks a successful canary record
  matching its exact version and SHA-256, marketplace release shall be
  blocked.

## Open questions

None.

## Rubric check

**PASS.** Frontmatter is complete; the approved ADR and behavioral upstream
are declared and correctly versioned; scope is bounded; repository, execution,
evidence, and cadence contracts are implementable; GWT scenarios cover the
end-to-end outcomes; EARS requirements state the invariants; and no unresolved
question is hidden. Per the Grove lifecycle companion, this self-check
promotes the agent-authored spec from `draft` to `gated`.
