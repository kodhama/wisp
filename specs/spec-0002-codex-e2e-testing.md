---
id: spec-0002-codex-e2e-testing
type: spec
status: gated
depends_on:
  - adr-0007-codex-canary-evidence
  - adr-0008-retire-family-release-certification
  - adr-0009-independent-plugin-package-metadata
  - adr-0011-node-24-only-support
  - adr-0014-retire-preview-qualification-machinery
  - spec-0001-plugin-mcp-distribution@v12
implements: adr-0014-retire-preview-qualification-machinery
owner: agent
updated: 2026-07-26
version: 8
---

# SPEC-0002 — Reproducible Codex adapter and dashboard E2E

> **AMENDED 2026-07-26**
> **WHAT:** Closed three intrinsic capability-safety gaps in v8: the exact
> combined subprocess-output bound, silent health/callback failure reduction,
> and immutable pre-sink browser-evidence ordering.
> **WHY:** The first intrinsic spec-adversary pass found that the retained
> volatile and browser boundaries were not exact enough to prove fail-closed
> behavior under overflow, exceptions, or capability-discard races.
> **SCOPE:** Canary buffering and result precedence, health/callback failure
> handling, browser evidence preparation/persistence, acceptance criteria,
> verification matrix, rubric, and gate record. Version remains 8 because the
> repair closes existing safety guarantees without changing ADR-0014 scope.
> **POINTER:** First intrinsic `NEEDS-REVISION` pass for SPEC-0002@v8.
> **VALUE:** A contributor can inject output, health, callback, and browser
> failures without risking secret-bearing artifacts or ambiguous smoke results.
> **CONFIDENCE:** verified.

> **AMENDED 2026-07-26**
> **WHAT:** Stages SPEC-0001@v12's eight-path Preview payload, retires the
> exact-candidate verifier and its version/SHA inputs, and reframes scheduled
> and manual Codex runs as live marketplace-drift smoke with no qualification
> or release-proof semantics.
> **WHY:** ADR-0014 preserves deterministic installed-plugin E2E and useful
> real-host drift detection while retiring aggregate qualification machinery.
> **SCOPE:** Upstream and test-ledger pins, staged inventory, canary modes and
> evidence schema, result precedence, acceptance criteria, verification
> matrix, and verifier removal; version advanced from 7 to 8. The pinned
> Playwright supply-chain digest, Node 24 execution target, runtime/dashboard
> assertions, process cleanup, and capability-safe evidence boundaries remain
> in scope; the follow-up v8 amendment above makes the retained safety
> boundaries intrinsically exact.
> **POINTER:** ADR-0014 and SPEC-0001@v12.
> **VALUE:** A contributor gets deterministic regression coverage and a live
> Preview drift signal without representing either as support certification.
> **CONFIDENCE:** verified.

> **AMENDED 2026-07-25**
> **WHAT:** Replaced the Node.js 20/22/24 fast-test matrix with one explicit
> Node.js 24 job, required the pinned Playwright container and both real Codex
> canary modes to record and assert a Node 24 runtime, and advanced all
> current dependency pins to SPEC-0001@v11/SPEC-0002@v7.
> **WHY:** ADR-0011 makes Node.js 24 Wisp's sole supported and qualified
> runtime and rejects retaining even a one-entry matrix abstraction.
> **SCOPE:** Pull-request workflow topology, test-dependency identities,
> installed-candidate source pin, container/canary runtime preflights,
> acceptance criteria, and verification evidence; version advanced from 6 to
> 7. Browser and real-Codex test behavior beyond the runtime assertion,
> capability-safety boundaries, and all tested product behavior remain
> unchanged.
> **POINTER:** ADR-0011 and SPEC-0001@v11.
> **VALUE:** A Wisp contributor gets one fast, explicit compatibility gate
> that tests exactly the runtime the product supports.
> **CONFIDENCE:** verified.

> **AMENDED 2026-07-24**
> **WHAT:** Advanced deterministic installed-plugin staging from the prior
> eight-path payload to SPEC-0001@v10's ten-path payload, including `VERSION`
> and `surfaces.json`, advanced dependency-ledger identity, recorded the
> existing Playwright pins and canary deadlines exactly, and clarified the
> contracted shared pre-sink boundary.
> **WHY:** ADR-0009 makes those files part of the exact Wisp candidate rather
> than optional repository metadata.
> **SCOPE:** Candidate file inventory, staging, dependency pins, and
> reviewer-requested exactness for existing E2E constants and safety
> boundaries; version advanced from 5 to 6. These clarifications add no Codex,
> MCP, dashboard, browser, capability-safety, or canary implementation change
> and do not claim that the retained pre-sink implementation debt has landed.
> **POINTER:** ADR-0009, ADR-0007, and SPEC-0001@v10.
> **VALUE:** A contributor's deterministic Codex fixture exercises the same
> complete package that a host cache receives.
> **CONFIDENCE:** verified.

> **AMENDED 2026-07-24**
> **WHAT:** Retired the family release/runtime machinery while retaining the
> Wisp-owned capability-safe transcript and browser-failure persistence
> boundary introduced during v4.
> **WHY:** ADR-0008 removes shared release certification while retaining
> Wisp-owned installed-adapter, dashboard, and Codex evidence.
> **SCOPE:** Version/dependency identity and retirement of only the shared
> family release additions. Raw dashboard capabilities remain volatile; every
> persistent form is redacted and absence-scanned before its first sink, and
> uncertainty blocks persistence and upload.
> **POINTER:** ADR-0008 and SPEC-0001@v9.
> **VALUE:** Wisp's executable host evidence remains testable without a shared
> release engine or validator runtime.
> **CONFIDENCE:** verified.

## Scope

This specification defines two complementary Codex test layers:

1. one deterministic Linux pull-request gate that stages the package as an
   installed Codex plugin, drives its stdio MCP directly, and renders its
   authenticated dashboard with Playwright Chromium; and
2. one real-Codex canary that runs weekly against the marketplace package and
   by explicit dispatch as a manual Preview smoke against a declared
   marketplace source.

The deterministic gate proves the published adapter, MCP, project binding,
bus, dashboard, and browser surface without credentials, model calls, or
external network access. The canary alone proves Codex CLI discovery,
installation, model-mediated representative tool use, and host-managed MCP
lifecycle. The deterministic gate owns the exact seven-tool inventory because
`codex exec --json` emits individual MCP calls but no startup inventory event.
Claude remains outside scope and tracked by issue #25.

All Wisp behavior under test, including the exact eight-path plugin payload,
seven MCP tools, canonical bus, dashboard security, and ownership lifecycle,
is inherited from `spec-0001-plugin-mcp-distribution@v12` and is not redefined
here.

## Required repository surfaces

| Path | Contract |
|---|---|
| `test/e2e/codex-plugin.e2e.ts` | The single deterministic Playwright suite described below |
| `test/e2e/playwright.config.ts` | Chromium only; one worker; no retries; trace, video, screenshot, attachment, file reporter, console artifact, and network artifact persistence disabled |
| `test/e2e/Dockerfile` | Pinned official Playwright image by tag and digest; installs with `npm ci`, copies the package, and runs unprivileged |
| `test/test-deps.toml` | Repo test-dependency ledger with `unit` and `e2e` package entries |
| `scripts/run-e2e-container.mjs` | Shell-free Docker build/run driver; runs the image with `--network none`, an ephemeral home, and no host credential mounts |
| `scripts/codex-canary.mjs` | Real-host canary driver and evidence writer |
| `.github/workflows/ci.yml` | One explicit Node 24 fast job with no strategy matrix, plus one required `codex-e2e` job |
| `.github/workflows/codex-canary.yml` | Weekly schedule and manual Preview-smoke `workflow_dispatch` |
| `package.json` | Exact scripts `test:e2e` and `test:e2e:container`, plus an exact Playwright development version |

`@playwright/test` SHALL be exactly `1.61.0`. The container base SHALL be
exactly
`mcr.microsoft.com/playwright:v1.61.0-noble@sha256:57b65fdc9ceabe0ef613124c7bbe2babcf9362c4d85e382fe3b03604e84b428a`.
At this pinned digest, the observed runtime is exactly Node `v24.16.0`.
Before the Playwright suite starts, the container command SHALL record the
exact runtime version in its non-secret run output and SHALL fail unless its
parsed SemVer major is exactly `24`. A future image-pin update SHALL repeat
the observation and retain the major-24 assertion; `v24.16.0` describes the
current immutable image rather than promising that patch for a future pin.
Any dependency update SHALL change the exact package version, matching image
tag, verified immutable digest, lockfile, and their assertions atomically.
The copied working directory SHALL be writable by the unprivileged runtime
user, including Playwright's `test-results` output.
`npm run test:e2e` SHALL build Wisp and run the suite directly.
`npm run test:e2e:container` SHALL invoke only
`node scripts/run-e2e-container.mjs`; CI SHALL use that same command.
The Playwright configuration and test harness own artifact disabling and
pre-sink redaction in both invocations; the container driver adds isolation
but is not the sole capability-safety boundary.
Compose SHALL NOT define a second topology. A future one-service wrapper may
delegate to this command without changing the test architecture.

`test/test-deps.toml` SHALL have schema `1` and exactly two package tables.
`packages.unit` covers `test/*.test.ts` and names
`spec-0001-plugin-mcp-distribution@v12`. `packages.e2e` covers
`test/e2e/**`, names `spec-0001-plugin-mcp-distribution@v12`,
`spec-0002-codex-e2e-testing@v8`, and the unversioned decisions
`adr-0006-codex-e2e-testing`, `adr-0007-codex-canary-evidence`, and
`adr-0011-node-24-only-support`. The implementation SHALL update
`.grove/config.toml`'s `TEST_DEPS_LEDGER` token to this path.

## Deterministic pull-request gate

Each run SHALL create fresh fixture projects, `HOME`, and `CODEX_HOME`. It
SHALL build the package once, verify the source plugin has exactly the eight
distributed paths defined by SPEC-0001@v12, and byte-copy all eight paths to:

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

### Capability-safe Playwright failure boundary

The capability-bearing browser interval begins when the suite receives the
MCP-returned dashboard URL and ends only after every page/context is closed,
all console/network observers are detached, and the observed capability is
discarded. Throughout that interval:

- Playwright `trace`, `video`, and `screenshot` are exactly `off`; no retry,
  attachment, snapshot, error-context, HTML/JSON/JUnit/blob reporter, console
  artifact, or request/response archive is created;
- console, page-error, request, response, and authorization observations are
  held only in process memory and reduced to typed booleans, counts, status,
  and redacted shape fields;
- Playwright/test stdout and stderr have no direct terminal, workflow-log, or
  file descriptor sink: the gate harness reads both through pipes and,
  before emitting a byte, replaces `#capability=<observed>` with
  `#capability=<redacted>`, `Bearer <observed>` with `Bearer <redacted>`, and
  every remaining exact `<observed>` value with `<redacted>`; and
- the sanitizer scans each prospective emitted message for the observed
  capability, `#capability=[A-Za-z0-9_-]{43}`, and
  `Bearer [A-Za-z0-9_-]{43}`. On a match or sanitizer failure it suppresses
  the entire message, emits only
  `error: browser-capability-redaction-failed\n`, marks the gate failed, and
  permits no artifact upload.

The Playwright output directory SHALL be absent or empty before this interval
and SHALL receive no file during it. A post-step asserts that condition, but
deleting a file after creation does not satisfy it. An exception, assertion
failure, timeout, browser crash, process signal, or cleanup failure follows
the same pre-sink rules; no framework default failure writer may bypass the
harness in either direct or container execution.

After every page/context is closed and every observer is detached, but while
the complete exact observed-capability set is still retained, browser
evidence preparation SHALL run in this order:

1. Build the complete flat prospective evidence object from reduced typed
   values and freeze that object against mutation.
2. Validate its exact schema and pass/fail invariants.
3. Serialize it exactly once as
   `JSON.stringify(frozenEvidence, null, 2) + "\n"` and retain those
   prospective UTF-8 bytes in volatile memory.
4. Scan those exact bytes against every exact observed capability and the
   fragment- and bearer-shaped grammars.
5. Only after validation and every scan succeeds, discard the observed
   capabilities; that discard ends the capability-bearing interval.
6. After the interval, persist only the already validated and scanned byte
   buffer at `test-results/browser-evidence.json`, without rebuilding,
   mutating, reserializing, or substituting evidence.

Preparation, freeze, validation, serialization, scan, or cleanup failure
discards the capabilities, writes no browser evidence, and permits no upload.
The frozen object rejects unknown properties and contains exactly:

```json
{
  "schema": 1,
  "result": "pass",
  "failure_stage": null,
  "loopback_origin": "http://127.0.0.1:<port>",
  "dashboard_url_shape": "http://127.0.0.1:<port>/#capability=<redacted>",
  "authorization_shape": "Bearer <redacted>",
  "fragment_removed": true,
  "authenticated_health_status": 200,
  "external_request_count": 0
}
```

`result` is `pass` or `fail`. `failure_stage` is `null` only on pass and
otherwise the first applicable value among `pre-dashboard`, `dashboard-call`,
`browser-launch`, `navigation`, `dom`, `authorization`, `cleanup`, and
`redaction`. `loopback_origin` is `null` or the exact shown loopback grammar
with a decimal port from 1 through 65535. `dashboard_url_shape` is `null` or
that same origin followed by the exact shown redacted fragment.
`authorization_shape` is `null` or exactly `Bearer <redacted>`.
`fragment_removed` is boolean or `null`; `authenticated_health_status` is an
integer from 100 through 599 or `null`; and `external_request_count` is a
nonnegative safe integer. A pass requires all shown non-null values exactly.
This record is structural evidence only: it never authenticates, substitutes
for the live checks, or contains raw console, network, exception, page,
request, response, trace, screenshot, or video content. If the browser
interval or scans cannot be proved safe, no `browser-evidence.json` is
written.

The DOM evidence mapping is exact:

- `[data-wisp-view="lifecycle"] [data-run="<run>"][data-agent="<agent>"]`
  SHALL show the sentinel status `state` and `activity` and the sentinel
  verdict in child elements whose `data-field` values are exactly `state`,
  `activity`, and `verdict`;
- `[data-wisp-view="timeline"] [data-event-index]` SHALL contain every valid
  fixture event, with zero-based indices matching physical bus order;
- `[data-wisp-view="commands"] [data-command-id="<id>"]` SHALL first show the
  browser-appended command through children with `data-field="type"`,
  `data-field="target"`, and `data-field="command-status"`, the last initially
  `pending`; after the MCP client acknowledges that exact id and the page
  refreshes, that same status field SHALL show the exact acknowledgement
  state; and
- `[data-wisp-view="parse-errors"] [data-line="<line>"]` SHALL show the exact
  parse-error reason and raw malformed line in children whose `data-field`
  values are exactly `parse-reason` and `parse-raw`.

The fast pull-request job in `.github/workflows/ci.yml` SHALL set up Node 24
explicitly, with no strategy matrix, and run typecheck, unit tests, bundle
build, and plugin validation exactly once. The separate `codex-e2e` job SHALL
depend on that successful fast job and run the container command once. The
workflow SHALL reject Node 20 or 22 fast-job entries and any matrix
abstraction for Node compatibility.

## Real Codex canary

`.github/workflows/codex-canary.yml` SHALL have exactly these modes:

- `schedule`: once per week, install current stable Codex CLI and the current
  `wisp@kodhama` marketplace package;
- `workflow_dispatch`: require only a declared marketplace source/ref, then
  install current stable Codex CLI and Wisp from that source as manual Preview
  smoke.

Neither mode SHALL accept a candidate version or bundle SHA-256 input, invoke
an exact-candidate verifier, mutate checked-in evidence, or describe its
result as qualification, release proof, or support proof.

Both modes SHALL use an explicit Node 24 setup. Before canary installation or
driver execution, the workflow SHALL record the exact `node --version` output
as non-secret job evidence and SHALL fail unless the parsed SemVer major is
exactly `24`.

Both modes SHALL use a fresh `CODEX_HOME` and fixture project. The driver
SHALL record the declared marketplace source, `codex --version`, resolved
plugin version, and the `codex exec --json` transcript. It SHALL invoke Codex with
`approval_policy="on-request"` and `approvals_reviewer="auto_review"` so
headless MCP approvals retain risk review; it SHALL NOT use an approval or
sandbox bypass. A nonce-bearing prompt SHALL require, in order, `wisp_check`,
one `wisp_status` write, and `wisp_dashboard`. Pass requires structured
completed `mcp_tool_call` evidence for those three tools, the nonce event at
the exact fixture bus, and authenticated dashboard health at the returned URL.
Model prose alone cannot satisfy a call assertion. The exact seven-tool
inventory remains mandatory in the deterministic installed-plugin gate.

Each spawned command and all of its streamed-line callbacks SHALL share one
deadline beginning immediately after `spawn` returns: `codex --version` uses
30,000 ms; each marketplace/plugin setup command uses 120,000 ms; and
`codex exec --json` uses 300,000 ms. On POSIX, expiration SHALL send
`SIGTERM` to the spawned process group and `SIGKILL` after a 2,000 ms grace
period so Codex-owned MCP and dashboard descendants cannot outlive the
canary. A dashboard health request starts only while the exec child is live,
has its own 5,000 ms upper bound, and aborts earlier when the parent exec
deadline signal fires. A timed-out execution or callback cannot satisfy
transcript verification.

A dashboard health fetch rejection, synchronous throw, response-access
exception, 5,000 ms timeout, or parent abort SHALL reduce silently to
`dashboard_health_passed: false`. A streamed-line callback throw or rejection
SHALL set callback failure and `transcript_verified: false`. Either condition
forces overall `fail` in weekly and manual modes, never `inconclusive`. The
volatile boundary SHALL catch these failures without printing, persisting,
uploading, or serializing the thrown value, request, response, error object,
Authorization header, bearer, or callback arguments; retained evidence
contains only the contracted typed fields.

The transcript normalization predicate is exact. A nonblank stdout line is a
Wisp tool-call item only when it parses as a JSON object whose top-level
`type` is `item.started` or `item.completed` and whose `item` is an object
with `type: "mcp_tool_call"`, `server: "wisp"`, and a string `tool`. It is a
successful completed Wisp call only when the top-level type is
`item.completed`, `item.status` is `"completed"`, `item.error` is `null`,
and `item.result` is a non-null object. `completed_tools` is the array of
distinct successful completed tool names among `wisp_check`, `wisp_status`,
and `wisp_dashboard`, in first successful-completion order. In every result
state it has at most three unique members and no other member vocabulary; only
`pass` requires the exact three-name order shown below.

The six behavioral booleans have these exclusive truth conditions:

- `check_passed`: a successful completed `wisp_check` carries the exact nonce
  run and `codex-canary` agent arguments and
  `item.result.structured_content.ok === true`;
- `write_passed`: a successful completed `wisp_status` carries that run and
  agent plus exact state `working` and nonce activity and a structured
  result with `item.result.structured_content.ok === true`;
- `bus_path_verified`: `<fixture>/.wisp/events.ndjson` contains a valid
  canonical status event with those exact four values;
- `dashboard_call_passed`: a successful completed `wisp_dashboard` has no
  arguments beyond the empty object,
  `item.result.structured_content.ok === true`, and an exact
  `http://127.0.0.1:<port>/#capability=<43-character-base64url>` URL at
  `item.result.structured_content.data.url`;
- `dashboard_health_passed`: while the Codex process is still live, the driver
  extracts that fragment capability, sends it only as a bearer token to
  `<origin>/api/health`, and receives HTTP `200`; and
- `transcript_verified`: every nonblank stdout line parses as JSON, the stream
  contains `thread.started`, then `turn.started`, then `turn.completed`, no
  `turn.failed` or top-level `error`, and `codex exec` exits `0` before its
  deadline.

For each spawned command, stdout and stderr share one exact
`4,194,304-byte` raw acceptance budget. Complete incoming chunks are
considered in callback-arrival order. A chunk is accepted only when its full
byte length keeps the combined accepted total at or below 4,194,304. The
first crossing chunk is wholly rejected; no partial bytes from it and no
later output are accepted. Overflow aborts streamed callbacks, terminates the
process group under the same deadline cleanup, sets `outputExceeded`, and
forces overall `fail` in weekly and manual modes, never `inconclusive`.

Accepted stdout and stderr remain volatile and SHALL NOT be teed, logged,
cached, or uploaded raw. For `codex exec`, only the previously accepted stdout
prefix is eligible to become `codex.jsonl`; accepted stderr remains volatile
and may contribute only to typed result classification. The accepted stdout
prefix still undergoes the exact capability transformation and absence scans
below. Only its resulting scanned bytes and the scanned typed evidence may
cross the first persistent sink. A truncated/unsafe prefix, transform error,
or scan failure produces no transcript or upload. The driver computes the six
behavioral booleans and performs authenticated health from volatile values
while the Codex process is live.

Before the first persistent write, it derives retained `codex.jsonl` from the
raw bytes with exactly these byte replacements everywhere, including nested
JSON strings and failure output:

| Sensitive form | Retained form |
|---|---|
| `#capability=<43-character-base64url>` | `#capability=<redacted>` |
| `Bearer <43-character-base64url>` | `Bearer <redacted>` |

All bytes outside those matched 55-byte fragment forms and 50-byte bearer
forms remain byte-identical and in the same order. The driver then scans the
prospective retained bytes and requires absence of the exact observed
capability, every `#capability=[A-Za-z0-9_-]{43}` occurrence, and every
`Bearer [A-Za-z0-9_-]{43}` occurrence. The literal `<redacted>` sentinel
preserves URL/header structure but is not accepted as authentication or
behavioral proof. The raw stream, not the retained transcript, is the sole
input for `dashboard_call_passed`, `dashboard_health_passed`, and
`transcript_verified`; `evidence.json` retains their typed structural
results. If transformation or the post-transform scan fails, the run is
`fail`, no transcript crosses a persistent boundary, and artifact upload is
blocked.

Only after that check SHALL the workflow upload, without printing any member
to the job log, an artifact containing the redacted `codex.jsonl` and
`evidence.json`. `evidence.json` itself SHALL contain no capability-shaped
fragment, bearer, or exact observed capability. It rejects unknown properties
and has exactly this schema:

```json
{
  "schema": 1,
  "mode": "weekly",
  "result": "pass",
  "started_at": "YYYY-MM-DDTHH:mm:ss.sssZ",
  "finished_at": "YYYY-MM-DDTHH:mm:ss.sssZ",
  "workflow_id": 123,
  "workflow_run_url": "https://github.com/<owner>/<repo>/actions/runs/<id>",
  "git_sha": "<40 lowercase hexadecimal characters>",
  "marketplace_source": "<declared nonblank source/ref>",
  "codex_version": "<nonblank exact version or null when unobserved>",
  "plugin_version": "<SemVer or null when unobserved>",
  "completed_tools": [
    "wisp_check",
    "wisp_status",
    "wisp_dashboard"
  ],
  "check_passed": true,
  "write_passed": true,
  "bus_path_verified": true,
  "dashboard_call_passed": true,
  "dashboard_health_passed": true,
  "transcript_verified": true
}
```

Every shown key is required. `mode` is exactly `weekly` or `manual`;
`result` is exactly `pass`, `fail`, or `inconclusive`. Timestamps are real UTC instants in the shown
millisecond-precision ISO form and `finished_at` is not earlier than
`started_at`. `workflow_id` is a positive safe integer; the run URL is an
HTTPS GitHub Actions run URL ending in that decimal id; `git_sha` matches
`^[0-9a-f]{40}$`; `marketplace_source` is the nonblank declared source/ref;
and each of `codex_version` and `plugin_version` is either its observed value
or `null` when execution did not reach that observation. An observed Codex
version is nonblank and an observed plugin version is SemVer. Sentinel
substitutes for unobserved values are forbidden. All six named evidence fields
are booleans. On `pass`, both observed version fields SHALL be non-null and
`completed_tools` SHALL equal the three-name list
above exactly, without omissions, additions, duplicates, or reordering.
`workflow_id`, `workflow_run_url`, and `git_sha` SHALL come from valid
`GITHUB_RUN_ID`, `GITHUB_REPOSITORY`, and `GITHUB_SHA` values; the driver
SHALL reject missing or invalid workflow provenance rather than synthesize
placeholder evidence.

Result precedence is exact. In weekly mode, a dependency, authentication,
marketplace, or service absence proven before a Codex host emits any Wisp
`mcp_tool_call` item is `inconclusive`. Once the host emits a Wisp tool-call
item, any incomplete call, missing required completed call, wrong order, or
later behavioral failure is `fail`; model prose is not a call. A weekly run
with no Wisp tool call and no proven pre-tool absence is also `fail`. Manual
mode never records `inconclusive`: every pre-tool absence or behavioral
failure is `fail`. Neither smoke mode affects pull-request gates, package
identity, release, or support posture.

Output overflow and any health or streamed-callback exception defined above
take precedence over pre-tool external-absence classification and are always
`fail` in both modes.

For this precedence, a pre-tool external absence is proven only when spawning
Codex fails, the workflow's Codex installation step fails, a marketplace or
plugin-install command fails or reaches its deadline, or `codex exec`
exits nonzero and its stderr matches this case-insensitive expression:
`auth(?:entication|orization)?|credential|marketplace|network|service|rate.?limit|timed? out|unavailable|not found|ENOTFOUND|ECONN`.
An exception or nonzero command is still `fail` when that proof is absent.
The workflow SHALL allow the Codex installation step to complete as a failed
step outcome and pass that outcome to the driver so both smoke modes still
write their evidence artifacts.

The exact-candidate verifier and verifier-only tests SHALL be absent. Smoke
success means only that the declared marketplace source worked with the
observed Codex host for this run; it SHALL NOT be joined to checked-in
metadata or treated as a release or support gate.

Canary credentials SHALL be unavailable to ordinary pull-request jobs.
The canary wrapper SHALL remove `CODEX_API_KEY`, `OPENAI_API_KEY`, and its
workflow-only secret alias from every version, marketplace, and plugin-install
child environment, then expose only `CODEX_API_KEY` to the single
`codex exec` child.

Linux container and Linux smoke evidence exercises the `/proc` identity
provider only. It does not exercise or replace SPEC-0001's macOS `/bin/ps`
provider tests.

## Acceptance criteria

### Scenarios (Given/When/Then)

**S1 — CI-identical local gate**

- **Given** Docker and a clean checkout,
- **When** `npm run test:e2e:container` runs locally or in `codex-e2e`,
- **Then** both execute the same pinned, network-disabled image and the same
  Playwright command.

**S2 — Installed adapter boundary**

- **Given** the staged eight-path Preview package and an empty fixture project,
- **When** the literal manifest bootstrap is launched from that project,
- **Then** the client lists seven tools and writes only to that project's
  canonical bus, while all eight staged paths remain byte-identical and
  `qualification.json` and `surfaces.json` are absent.

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

**S6 — Canary cadence and Preview drift**

- **Given** a weekly trigger or manual Preview-smoke dispatch with a declared
  marketplace source,
- **When** the real Codex canary completes,
- **Then** it stores exact-schema structured-call/bus/dashboard evidence under
  automatic approval review, uses no candidate version or SHA input and no
  exact-candidate verifier, and represents the result only as marketplace and
  host drift smoke.

**S11 — Retained canary transcript is capability-safe**

- **Given** raw Codex JSONL containing a valid dashboard fragment or bearer at
  any top-level or nested string position,
- **When** the workflow prepares its retained artifact,
- **Then** it derives behavioral evidence from volatile raw bytes, replaces
  every sensitive form with the exact structural sentinel before the first
  write, preserves all other bytes, proves no observed or capability-shaped
  value remains in transcript, evidence, or logs, and uploads nothing if that
  proof fails.

**S12 — Browser failures cannot persist a live capability**

- **Given** a live dashboard capability and an injected assertion, timeout,
  crash, signal, or cleanup failure at each capability-bearing browser stage,
- **When** Playwright and its reporter handle that failure,
- **Then** raw trace, video, screenshot, attachment, console, network, and
  reporter artifacts have no filesystem or log sink, every emitted failure
  byte passes the exact in-memory redactor first, unsafe output is suppressed,
  and only the post-interval typed redacted evidence record may persist after
  its absence scans pass.

**S13 — One Node 24 fast gate**

- **Given** the pull-request CI workflow,
- **When** the fast repository gate runs,
- **Then** it sets up Node 24 explicitly and runs typecheck, unit tests,
  bundle build, and plugin validation exactly once without a strategy matrix,
  and the separate `codex-e2e` job depends on that success and runs its
  container command once, without creating a Supported claim.

**S14 — Node 24 container and smoke execution**

- **Given** the pinned Playwright image or either real Codex smoke mode,
- **When** its runtime preflight executes before the test or canary driver,
- **Then** the exact Node version is recorded in non-secret run evidence, its
  parsed major is asserted as `24`, and a mismatch prevents Playwright or
  canary execution; the current pinned container observation is `v24.16.0`.

**S15 — Combined output overflow fails safely**

- **Given** subprocess chunks whose accepted stdout-plus-stderr total is
  exactly 4,194,304 bytes and whose next complete chunk crosses that bound,
- **When** the volatile command collector receives them,
- **Then** it accepts every prior whole chunk, rejects the whole crossing
  chunk and all later output, aborts callbacks, terminates the process group,
  records `fail` in either smoke mode, and persists at most the previously
  accepted stdout prefix after the ordinary transformation and scans.

**S16 — Health and callback exceptions are typed failures**

- **Given** injected health fetch rejection, synchronous throw,
  response-access exception, timeout, parent abort, and streamed-callback
  throw or rejection whose error values contain bearer-shaped sentinels,
- **When** the canary reduces volatile host evidence,
- **Then** health or transcript verification becomes false, the smoke result
  is `fail` rather than `inconclusive`, and no thrown value, request, response,
  error object, Authorization header, bearer, or callback argument reaches a
  transcript, evidence file, log, or upload.

**S17 — Browser evidence is scanned before capability discard**

- **Given** closed browser contexts, detached observers, reduced evidence, and
  the complete exact observed-capability set still in memory,
- **When** browser evidence is prepared,
- **Then** the object is frozen, validated, serialized once, and its exact
  prospective bytes are scanned before capabilities are discarded; only
  those already-scanned bytes may be persisted afterward, and any ordering,
  mutation, validation, serialization, scan, or cleanup failure writes
  nothing.

### Requirements (EARS)

- **R1 (ubiquitous):** The pull-request E2E gate shall require no Codex
  credentials, model call, or external runtime network.
- **R2 (ubiquitous):** Local CI-parity execution shall use the same container
  driver, pinned image, dependency lock, and test command as CI.
- **R3 (event-driven):** When the suite launches Wisp, it shall use the
  byte-staged plugin and literal Codex manifest from the fixture project cwd.
- **R4 (event-driven):** When browser E2E runs, it shall verify explicit
  startup, singleton reuse, project isolation, exact mapped DOM evidence,
  command append and acknowledgement, security, cleanup, and recovery through
  observable boundaries.
- **R5 (event-driven):** When the scheduled canary proves an external
  dependency absence before any structured Wisp tool-call item, it shall record
  `inconclusive` without affecting pull requests.
- **R6 (ubiquitous):** Weekly and manual Codex runs shall remain Preview drift
  smoke, accept no candidate version or bundle-SHA input, invoke no
  exact-candidate verifier, mutate no checked-in evidence, and create no
  qualification, release, or support result.
- **R13 (event-driven):** When a Codex canary transcript or evidence is
  retained, the workflow shall keep raw capability-bearing bytes volatile,
  apply the exact fragment and bearer replacements before the first
  persistent write, verify absence of the observed and capability-shaped
  values, and block persistence and upload on failure.
- **R14 (unwanted behavior):** If a capability-bearing Playwright step or its
  cleanup fails, the suite shall disable every raw framework artifact writer,
  route stdout/stderr through the exact pre-sink redactor, suppress output
  whose safety cannot be proved, leave no browser artifact file, and persist
  only the scanned typed redacted record after the capability-bearing interval.
- **R15 (ubiquitous):** The deterministic installed-plugin fixture shall
  verify and byte-stage exactly SPEC-0001@v12's eight distributed paths into
  the manifest-version cache directory and shall reject either retired
  metadata file.
- **R16 (ubiquitous):** The fast pull-request job shall use exactly Node 24
  without a strategy matrix and shall run typecheck, unit tests, bundle build,
  and plugin validation once; it shall contain no Node 20 or 22 compatibility
  entry and shall not describe technical compatibility as a Supported claim.
- **R17 (event-driven):** Before the pinned Playwright container suite or
  either real Codex smoke mode executes, its runtime preflight shall record
  the exact Node version, assert parsed major `24`, and fail closed on a
  missing, malformed, or non-24 observation.
- **R18 (state-driven):** While a spawned command is running, stdout and
  stderr shall share an exact 4,194,304-byte raw budget; the first wholly
  unaccepted crossing chunk shall abort callbacks and process execution,
  force `fail`, and leave only the prior accepted stdout prefix eligible for
  pre-sink transformation, scanning, and persistence.
- **R19 (unwanted behavior):** If health fetch or response handling rejects,
  throws, times out, or aborts, or a streamed callback rejects or throws, the
  canary shall reduce only to false typed evidence and overall `fail` and
  shall never serialize or emit the thrown value, request/response/error
  object, Authorization header, bearer, or callback arguments.
- **R20 (event-driven):** When browser evidence may be retained after cleanup,
  the suite shall freeze the complete flat object, validate it, serialize it
  once, and scan those exact bytes against the still-retained complete
  observed-capability set before discarding capabilities and ending the
  interval; persistence shall write only that scanned buffer with no rebuild
  or reserialization.

## Verification matrix

| Contract area | Minimum evidence |
|---|---|
| Installed Preview payload | Fixture staging proves byte-for-byte copying of exactly SPEC-0001@v12's eight paths into the manifest-version cache, rejects `qualification.json` and `surfaces.json`, launches the literal manifest bootstrap, lists seven tools, and confines bus writes to the fixture project |
| Capability-safe artifacts | Positive fixtures cover one and multiple fragment/bearer occurrences in top-level and nested JSON strings for pass, fail, and inconclusive runs; byte comparisons prove exact sentinel replacement and otherwise-identical retained JSONL; one shared counter accepts exactly 4,194,304 mixed stdout/stderr bytes, rejects the whole first crossing chunk and later output, aborts callbacks/processes, forces fail in both modes, retains only the prior stdout prefix, and still transforms/scans it before persistence; raw-output spies prove no tee or raw stderr write, and injected transform/scan failures prove no artifact readiness or upload |
| Capability-safe browser failures | Playwright configuration inspection proves trace/video/screenshot/retry/file reporters and attachments are disabled; injected assertion, timeout, crash, signal, and cleanup failures at every browser stage place the observed capability in page URL, bearer, console, network, exception, and reporter inputs; ordering spies prove cleanup then freeze→validate→single serialization→exact-capability scan→discard/end→same-buffer persistence, mutation attempts cannot alter frozen evidence, persisted bytes equal the pre-scanned buffer, no write occurs before discard, and every preparation/order/failure injection writes nothing |
| Live Preview smoke | Workflow and driver fixtures prove weekly/current-source and manual/declared-source modes; representative read, write, dashboard, health, bus-path, and model-mediated host behavior; fetch rejection, synchronous throw, response-access failure, timeout, parent abort, and callback throw/rejection reduce silently to false typed fields and fail in both modes; bearer-bearing error/request/response/callback objects reach no sink; no candidate version or SHA input, exact-candidate verifier, checked-in evidence mutation, qualification, release, or support result; and only pre-tool external absence remains weekly-inconclusive |
| Fast Node gate | Workflow inspection proves one explicit Node 24 setup, no strategy matrix or Node 20/22 entry, one execution of typecheck/unit/build/plugin-validation, and `codex-e2e` dependency on that successful job; documentation treats Node 24 as a technical target, not support |
| Node runtime preflights | The pinned Playwright image reports `v24.16.0`; container and weekly/manual smoke fixtures record exact runtime output, accept major 24, and fail before test or smoke execution for missing, malformed, Node 20, or Node 22 observations |

## Open questions

None.

## Rubric check

**PASS.** Frontmatter is complete; ADR-0014 and SPEC-0001@v12 are consumable
upstreams with the exact behavioral pin; scope is bounded; repository,
execution, evidence, cadence, retired-verifier, and eight-path staging
contracts are implementable; GWT scenarios cover deterministic E2E, weekly
and manual Preview smoke, Node 24 execution, exact combined-output overflow,
silent health/callback failure, and pre-discard browser scanning; S1–S6 and
S11–S17 use GWT, R1–R6 and R13–R20 use EARS, every amended contract maps to
executable evidence, and no unresolved question is hidden. The Grove
lifecycle companion therefore retains version 8 as `gated` after this
self-check.

## Gate record

Version 5 records the maintainer's explicit reset intent. The independent
decision adversary returned `SOUND` after the product-local transcript and
browser-failure persistence boundary was restored, and the independent
conformance reviewer returned `PASS`. Recording `approved` here records those
completed gates; it does not claim the retained implementation debt has
landed. Hosted Codex review then found and this version corrected one
overbroad sentence: an exit-`0` Codex verifier is necessary evidence, never a
substitute for Wisp's remaining product-owned release gates.

Version 6 records ADR-0009's exact ten-path installed-candidate staging and
dependency-ledger amendment. It also records the independent spec review's
clarification of the already implemented Playwright package/image pins and
exact canary command, callback, health, and kill deadlines, plus the
contracted direct/container pre-sink ownership whose retained implementation
debt is not claimed complete here. The rubric self-check above passed and
moved this version to `gated`. On 2026-07-25 the independent spec adversary
returned `APPROVE-READY`, which is the agent-owned spec-gate ratification
under the steward profile; the independent conformance review returned
`PASS`, and the corpus review returned `PASS`. The version remains `gated`,
the consumable state recorded by that agent-owned gate.

Version 8 records ADR-0014's eight-path installed Preview package, retired
exact-candidate verifier and version/SHA inputs, and weekly/manual live drift
smoke semantics while preserving deterministic E2E, Node 24 execution, and
capability-safe evidence handling. The configured rubric self-check above
passed, so this amendment is `gated`; no independent spec-adversary or
conformance verdict is claimed here.

The first intrinsic spec-adversary pass for gated v8 returned
`NEEDS-REVISION`: the subprocess-output bound lacked exact combined-stream
and overflow precedence, health and callback exceptions lacked silent typed
failure semantics, and browser evidence could be scanned after exact
capabilities were discarded. This repair specifies the 4,194,304-byte
whole-chunk boundary, false/fail exception reduction, and
freeze→validate→serialize-once→scan→discard→same-buffer persistence order in
prose, GWT, EARS, and the verification matrix while preserving v8 and
ADR-0014 scope; the rubric self-check remains `PASS`. No second adversary
verdict is claimed here.
