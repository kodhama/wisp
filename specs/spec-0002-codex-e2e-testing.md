---
id: spec-0002-codex-e2e-testing
type: spec
status: gated  # v4 self-checked 2026-07-24; independent spec-adversary and conformance review are owed before approval
depends_on:
  - adr-0007-codex-canary-evidence
  - adr-0006-family-plugin-release-and-surface-contract
  - spec-0001-plugin-mcp-distribution@v8
  - stewards/kodhama-spec-0001-family-plugin-release-and-distribution-metadata@v2
implements: adr-0007-codex-canary-evidence
owner: agent
updated: 2026-07-24
version: 4
---

# SPEC-0002 — Reproducible Codex adapter and dashboard E2E

> **AMENDED 2026-07-24**
> **WHAT:** Bound deterministic and canary candidate validation to SPEC-0001
> v8's explicit runtime store, immutable Wisp validator-runtime digest, exact
> Stewards v2 extension protocol, and typed candidate-receipt field; required
> capability-safe transcript and Playwright-failure transformation before
> artifact retention.
> **WHY:** Candidate evidence cannot reproduce Wisp's family pre-tag result
> unless it proves the same digest-bound validator runtime used by the release
> contract. An uploaded raw `wisp_dashboard` result or Playwright failure
> trace, screenshot, video, console, network, or reporter artifact would also
> persist its capability and violate SPEC-0001's no-persistence invariant.
> **SCOPE:** Dependency pins, E2E/canary validation inputs, candidate receipt
> verification, transcript/browser retention, scenarios, requirements, and
> verification matrix; version advanced from 3 to 4. Installed payload,
> MCP/dashboard behavior, browser interaction assertions, surface evidence,
> and non-promotion semantics remain unchanged; only their safe retention
> boundary is tightened.
> **POINTER:** SPEC-0001 v8 and
> `stewards/kodhama-spec-0001-family-plugin-release-and-distribution-metadata@v2`;
> spec-adversary `NEEDS-REVISION` reviews on `f503602` and `8eb520f`.
> **VALUE:** A Wisp maintainer can trust Codex evidence to cover the same
> bounded product validator that the release gate runs without leaking the
> live dashboard capability through retained failure evidence.
> **CONFIDENCE:** verified.

> **AMENDED 2026-07-24**
> **WHAT:** Bound the installed-plugin gate and canary to SPEC-0001 v7's
> nine-path payload, family release inventory, exact candidate bundle digest,
> and non-promoting surface evidence.
> **WHY:** ADR-0006 makes release identity and exact-surface claims
> version-bound; Codex evidence must prove the staged candidate without
> silently turning a candidate surface into support or bypassing Wisp's full
> qualification gate.
> **SCOPE:** Candidate staging, inventory and surface assertions, evidence
> handoff, release blocking, dependency pins, and verification; version
> advanced from 2 to 3. Existing deterministic/browser/canary behavior remains
> unchanged.
> **POINTER:** ADR-0006, SPEC-0001 v7, and the Stewards family metadata spec.
> **VALUE:** Codex evidence becomes reusable release input while remaining
> bounded to the exact Codex surface and candidate artifact it observed.
> **CONFIDENCE:** verified.

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
installation, model-mediated representative tool use, and host-managed MCP
lifecycle. The deterministic gate owns the exact seven-tool inventory because
`codex exec --json` emits individual MCP calls but no startup inventory event.
Claude remains outside scope and tracked by issue #25.

All Wisp behavior under test, including the exact nine-path plugin payload,
seven MCP tools, canonical bus, dashboard security, and ownership lifecycle,
is inherited from `spec-0001-plugin-mcp-distribution@v8` and is not redefined
here.

## Required repository surfaces

| Path | Contract |
|---|---|
| `test/e2e/codex-plugin.e2e.ts` | The single deterministic Playwright suite described below |
| `test/e2e/playwright.config.ts` | Chromium only; one worker; no retries; trace, video, screenshot, attachment, file reporter, console artifact, and network artifact persistence disabled |
| `test/e2e/Dockerfile` | Pinned official Playwright image by tag and digest; installs with `npm ci`, copies the candidate, and runs unprivileged |
| `test/test-deps.toml` | Repo test-dependency ledger with `unit` and `e2e` package entries |
| `scripts/run-e2e-container.mjs` | Shell-free Docker build/run driver; runs the image with `--network none`, an ephemeral home, and no host credential mounts |
| `scripts/codex-canary.mjs` | Real-host canary driver and evidence writer |
| `scripts/verify-codex-canary.mjs` | Deterministic candidate-evidence verifier used by the dispatched canary job and release operator |
| `scripts/wisp-release-contract.mjs` | Product inventory provider and release validator; the E2E gate consumes its checked output |
| `release/wisp/release.json` | Family release identity and carrier declaration used before staging |
| `release/wisp/release-inventory.json` | Checked-in complete inventory used to prove the staged nine-path payload |
| `release/wisp/candidate-state.json` | Committed candidate transaction identity included in candidate-validation receipts |
| `release/wisp/candidate-validation.v1.schema.json` | Typed receipt schema shared by candidate validation, canary driver, and verifier |
| `release/wisp/public-contract.json` | Machine source whose digest and rows are validated before staging |
| `release/wisp/contract-snapshots.json` | Closed public-contract digest preimages bound by candidate validation |
| `plugins/wisp/surfaces.json` | Version-bound exact-surface source staged with the plugin |
| `.github/workflows/ci.yml` | Existing Node 20/22/24 checks plus one required `codex-e2e` job |
| `.github/workflows/codex-canary.yml` | Weekly schedule and candidate `workflow_dispatch` |
| `package.json` | Exact scripts `test:e2e` and `test:e2e:container`, plus an exact Playwright development version |

The Playwright package version SHALL equal the semantic version in the
container image tag. The image SHALL also carry an immutable digest.
The copied working directory SHALL be writable by the unprivileged runtime
user, including Playwright's `test-results` output.
`npm run test:e2e` SHALL build Wisp and run the suite directly.
`npm run test:e2e:container` SHALL invoke only
`node scripts/run-e2e-container.mjs`; CI SHALL use that same command.
Compose SHALL NOT define a second topology. A future one-service wrapper may
delegate to this command without changing the test architecture.

`test/test-deps.toml` SHALL have schema `1` and exactly two package tables.
`packages.unit` covers `test/*.test.ts` and names
`spec-0001-plugin-mcp-distribution@v8`. `packages.e2e` covers
`test/e2e/**`, names `spec-0001-plugin-mcp-distribution@v8`,
`spec-0002-codex-e2e-testing@v4`, and the unversioned decisions
`adr-0006-family-plugin-release-and-surface-contract` and
`adr-0007-codex-canary-evidence`. The
implementation SHALL update
`.grove/config.toml`'s `TEST_DEPS_LEDGER` token to this path.

## Deterministic pull-request gate

Each run SHALL create fresh fixture projects, `HOME`, and `CODEX_HOME`. It
SHALL build the candidate once, verify the source plugin has exactly the nine
release paths, and byte-copy those paths to:

```text
<CODEX_HOME>/plugins/cache/kodhama/wisp/<manifest-version>/
```

Before copying, the suite SHALL provision the immutable validator-runtime
object named by `release.json.extensions.wisp.validator_runtime_sha256` in a
fresh absolute POSIX runtime store inside the pinned container, then run
Wisp's exact `--validate-candidate --runtime-store <that-store>` contract.
The selected object SHALL be exact and the store SHALL be unavailable to the
staged MCP/dashboard runtime after validation. Candidate validation includes
both repeated Stewards v2 extension executions and family pre-tag metadata
validation but permits
pending qualification and requires neither a release tag nor human release
approval. It SHALL require the two clean
inventory-provider byte streams to equal
`release/wisp/release-inventory.json`; the recursive installed-file inventory
to equal the metadata extension's exact nine staged paths; and package,
manifest, cache, MCP, qualification, surface, and inventory identities to bind
the same candidate version and bundle digest. The inventory SHALL contain
exactly fifteen public-contract rows, including the two `file-bytes`
host-visible skill contracts, and the gate SHALL independently hash both
skill files and the built `plugins/wisp/dist/wisp.mjs`.

The staged `surfaces.json` SHALL be byte-identical to the declared source,
carry that same version, and include `codex.local.interactive` without
asserting a broader Codex surface. A candidate row remains candidate; an
installed E2E pass is evidence input only and SHALL NOT edit the surface file,
qualification record, release inventory, or README derivatives.

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
  file descriptor sink: the container driver reads both through pipes and,
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
driver.

After the interval ends, and only after the same absence scans pass, the suite
may persist canonical JSON plus one LF at
`test-results/browser-evidence.json`. The object rejects unknown properties
and contains exactly:

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

The Node `20`, `22`, and `24` matrix entries in `.github/workflows/ci.yml`
SHALL each independently run typecheck, unit tests, build, and plugin
validation. The separate `codex-e2e` job SHALL depend on a successful matrix
and run the container command once.

## Real Codex canary

`.github/workflows/codex-canary.yml` SHALL have exactly these modes:

- `schedule`: once per week, install current stable Codex CLI and the current
  `wisp@kodhama` marketplace release;
- `workflow_dispatch`: require candidate version, candidate bundle SHA-256,
  candidate-validation receipt SHA-256, and candidate marketplace source/ref,
  then install current stable Codex CLI and that exact candidate.

Both modes SHALL use a fresh `CODEX_HOME` and fixture project. The driver
SHALL record `codex --version`, resolved plugin version, bundle SHA-256, and
the `codex exec --json` transcript. It SHALL invoke Codex with
`approval_policy="on-request"` and `approvals_reviewer="auto_review"` so
headless MCP approvals retain risk review; it SHALL NOT use an approval or
sandbox bypass. A nonce-bearing prompt SHALL require, in order, `wisp_check`,
one `wisp_status` write, and `wisp_dashboard`. Pass requires structured
completed `mcp_tool_call` evidence for those three tools, the nonce event at
the exact fixture bus, and authenticated dashboard health at the returned URL.
Model prose alone cannot satisfy a call assertion. The exact seven-tool
inventory remains mandatory in the deterministic installed-plugin gate.

Every spawned command and streamed-line callback SHALL share one finite
deadline. On POSIX, expiration SHALL terminate the spawned process group so
Codex-owned MCP and dashboard descendants cannot outlive the canary; the
health request SHALL also be bounded and abort with that deadline. A timed-out
execution cannot satisfy transcript verification.

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

The driver SHALL consume raw Codex stdout through a bounded volatile
pipe/buffer and SHALL NOT tee, log, cache, persist, or upload those raw bytes.
It computes the six behavioral booleans and performs the authenticated health
request from that volatile stream while the Codex process is live.

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
`evidence.json`; candidate mode additionally contains the exact
`candidate-validation.json` receipt while weekly mode forbids it.
`evidence.json` itself SHALL contain no capability-shaped fragment, bearer,
or exact observed capability. It rejects unknown properties and has exactly
this schema:

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
  "codex_version": "<nonblank exact version or null when unobserved>",
  "plugin_version": "<SemVer or null when unobserved>",
  "bundle_sha256": "<64 lowercase hexadecimal characters or null when unobserved>",
  "candidate_validation_sha256": "<64 lowercase hexadecimal characters or null in weekly mode>",
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

Every shown key is required. `mode` is exactly `weekly` or `candidate`;
`result` is exactly `pass`, `fail`, or `inconclusive`. Timestamps are real UTC instants in the shown
millisecond-precision ISO form and `finished_at` is not earlier than
`started_at`. `workflow_id` is a positive safe integer; the run URL is an
HTTPS GitHub Actions run URL ending in that decimal id; `git_sha` matches
`^[0-9a-f]{40}$`; each of `codex_version`, `plugin_version`, and
`bundle_sha256` is either its observed value or `null` when execution did not
reach that observation. `candidate_validation_sha256` is required and
non-null in candidate mode and exactly `null` in weekly mode. An observed
Codex version is nonblank, an observed plugin version is SemVer, and every
non-null digest matches `^[0-9a-f]{64}$`. Sentinel substitutes for unobserved
values are forbidden. All six named evidence fields are booleans. On `pass`,
all three identity fields SHALL be non-null and `completed_tools` SHALL equal
the three-name list above exactly, without omissions, additions, duplicates,
or reordering.
`workflow_id`, `workflow_run_url`, and `git_sha` SHALL come from valid
`GITHUB_RUN_ID`, `GITHUB_REPOSITORY`, and `GITHUB_SHA` values; the driver
SHALL reject missing or invalid workflow provenance rather than synthesize
placeholder evidence.

Result precedence is exact. In weekly mode, a dependency, authentication,
marketplace, or service absence proven before a Codex host emits any Wisp
`mcp_tool_call` item is `inconclusive`. Once the host emits a Wisp tool-call
item, any incomplete call, missing required completed call, wrong order, or
later behavioral failure is `fail`; model prose is not a call. A weekly run
with no Wisp tool call and no proven pre-tool absence is also `fail`. Candidate
mode never records `inconclusive`: every pre-tool absence or behavioral
failure is `fail`. Neither weekly result affects pull-request gates.

For this precedence, a pre-tool external absence is proven only when spawning
Codex fails, the workflow's Codex installation step fails, a marketplace or
plugin-install command fails or reaches its deadline, or `codex exec`
exits nonzero and its stderr matches this case-insensitive expression:
`auth(?:entication|orization)?|credential|marketplace|network|service|rate.?limit|timed? out|unavailable|not found|ENOTFOUND|ECONN`.
An exception or nonzero command is still `fail` when that proof is absent.
The workflow SHALL allow the Codex installation step to complete as a failed
step outcome and pass that outcome to the driver so both canary modes still
write their evidence artifacts.

The candidate workflow SHALL invoke:

```text
node scripts/verify-codex-canary.mjs \
  --evidence <evidence.json> \
  --bundle <installed-dist/wisp.mjs> \
  --version <requested-version> \
  --sha256 <requested-bundle-sha256> \
  --candidate-validation <candidate-validation.json> \
  --candidate-validation-sha256 <requested-receipt-sha256>
```

The verifier SHALL accept no unknown or duplicate arguments. It exits `0`
only when the evidence is schema-valid, mode `candidate`, overall `pass`, all
three completed tool names match exactly, all six behavioral booleans are
true, and its requested version, bundle hash, and candidate-validation digest
exactly match the evidence. The
`--bundle` value SHALL be an absolute path whose canonical value is exactly
`<real-CODEX_HOME>/plugins/cache/kodhama/wisp/<requested-version>/dist/wisp.mjs`;
it SHALL be a real regular file, not a symbolic link. The verifier hashes
those exact file bytes with SHA-256 and requires equality with both
`--sha256` and `evidence.bundle_sha256`.

`--candidate-validation` SHALL be an absolute path to the canonical receipt
written by SPEC-0001 v8 candidate validation for this workflow commit. The
verifier rejects a symlink, unsafe path, unknown receipt field, schema
mismatch, noncanonical bytes, or receipt whose `source_commit` differs from
`evidence.git_sha`; it hashes the exact receipt bytes and requires equality
with the dispatch input, `--candidate-validation-sha256`, and
`evidence.candidate_validation_sha256`. Receipt package version and bundle
digest shall equal the requested values, evidence, manifest, and installed
bundle. The receipt's release-metadata, inventory, public-contract, surface,
contract-snapshot, qualification, candidate-state, lifecycle-skill, and
dashboard-skill digests shall equal those files in the exact checked-out
source commit; each skill digest shall also equal its inventory `file-bytes`
extract, and the two README support digests shall equal the exact
marker-bounded support-line extracts selected by that inventory. Its
`validator_runtime_sha256` shall equal the release-metadata declaration and
the canonical manifest digest verified in the candidate job's explicit
runtime store before Codex starts.

It exits `1` for valid negative or
mismatched evidence and `2` for invalid/duplicate arguments, absent
`CODEX_HOME`, an unsafe or unreadable bundle/input, or invalid evidence
schema. Candidate evidence carrying `inconclusive` is schema-valid but exits
`1`. The verifier emits no transcript, credential, capability, or absolute
fixture path.

The workflow's candidate job SHALL fail on either nonzero result and expose
the successful workflow URL as its release evidence. Wisp SHALL make no
qualified-release claim without that URL and an exit-`0` verifier result.
This repository does not claim automatic enforcement in the external
Stewards publication repository; a Stewards release operator or workflow
must invoke this verifier with the candidate evidence before publication.
Canary credentials SHALL be unavailable to ordinary pull-request jobs.
The canary wrapper SHALL remove `CODEX_API_KEY`, `OPENAI_API_KEY`, and its
workflow-only secret alias from every version, marketplace, and plugin-install
child environment, then expose only `CODEX_API_KEY` to the single
`codex exec` child.

Linux container and Linux canary evidence exercises the `/proc` identity
provider only. It SHALL NOT replace the macOS `/bin/ps` qualification required
by SPEC-0001. A release's checked-in `plugins/wisp/qualification.json` is the
required record boundary for that macOS result; Codex canary artifacts may
support it but cannot silently set or substitute it.

Before installation, candidate mode provisions the digest-named runtime
object in a fresh absolute POSIX store and runs SPEC-0001 v8
`--validate-candidate --runtime-store <that-store> --receipt <new-temp-file>`
at `GITHUB_SHA`, hashes those
canonical bytes, and requires equality with the required
`candidate_validation_sha256` dispatch input captured from the prior
candidate-validation job. The input grammar is exactly 64 lowercase
hexadecimal characters. The workflow passes the typed receipt and digest to
the driver and final verifier; neither may reconstruct a receipt from caller
version/hash strings. Version, bundle SHA-256, source commit, release
metadata, inventory, public contract, contract snapshots, surface,
qualification, candidate state, both raw-byte skill contracts, and both
marker-bounded README support subjects must all match before Codex starts.

Successful evidence may be incorporated only by the product-owned
qualification operation that revalidates the exact candidate and atomically
updates the checked-in record. The canary workflow itself SHALL NOT mutate
`qualification.json`, `surfaces.json`, release metadata/inventory/history, or
support documentation.

The candidate workflow removes the ephemeral runtime store after receipt
generation and does not expose its path, runtime bytes, or Wisp validation
findings to the model-driven canary.

Even an exit-`0` candidate verifier is only the exact
`codex.local.interactive` portion of Wisp's standing gate. No
`wisp-v<version>` tag is eligible until SPEC-0001 v8's Node, Claude, Codex,
dashboard, overall, carrier, inventory, surface, derivative, and human
approval conditions all pass for the same candidate.

## Acceptance criteria

### Scenarios (Given/When/Then)

**S1 — CI-identical local gate**

- **Given** Docker and a clean checkout,
- **When** `npm run test:e2e:container` runs locally or in `codex-e2e`,
- **Then** both execute the same pinned, network-disabled image and the same
  Playwright command.

**S2 — Installed adapter boundary**

- **Given** the staged nine-path candidate and an empty fixture project,
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
- **Then** it stores exact-schema structured-call/bus/dashboard evidence under
  automatic approval review, and only a verifier exit `0` after hashing the
  exact installed candidate bundle qualifies the Codex portion of Wisp's
  release evidence.

**S7 — Family inventory-bound staging**

- **Given** a built candidate and checked-in family release metadata,
- **When** the deterministic gate prepares its Codex cache,
- **Then** candidate validation and two inventory runs agree on the candidate
  version, source commit, candidate-state, bundle, metadata, inventory,
  public contract, contract snapshots, qualification, surface source, both
  raw-byte skill contracts, both marker-bounded README support projections,
  all fifteen public-contract rows, and exact nine bytes/paths before those
  paths are staged, and write one canonical typed receipt.

**S8 — Evidence does not promote or release**

- **Given** a passing installed Codex E2E or candidate canary with exact
  version and digest,
- **When** its evidence is retained,
- **Then** no source, qualification, surface, support, tag, or history file is
  mutated and release remains blocked until SPEC-0001 v8's complete
  qualification and approval gate passes.

**S9 — Captured candidate receipt binds the canary**

- **Given** the canonical candidate-validation receipt captured by the prior
  validation job and its SHA-256 dispatch input,
- **When** candidate mode revalidates the workflow commit, installs Wisp, and
  verifies its evidence,
- **Then** the regenerated receipt bytes and every typed subject equal the
  captured digest, checked-out sources, installed bundle, and evidence record;
  any mismatch fails before Codex starts.

**S10 — Candidate validation uses the release runtime**

- **Given** the candidate's declared validator-runtime digest and a fresh
  container or canary job,
- **When** the job validates the candidate before staging or installation,
- **Then** it supplies one explicit absolute POSIX runtime store, proves the
  matching immutable object and both deterministic extension executions,
  records that digest in the typed receipt, and removes the store before the
  model-driven or installed Wisp runtime begins.

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
- **R6 (state-driven):** While a candidate lacks verifier exit `0` for its
  exact version and SHA-256, Wisp shall not claim it qualified for marketplace
  release; external Stewards enforcement requires that repository to invoke
  the verifier.
- **R7 (event-driven):** When deterministic E2E stages a plugin, it shall first
  verify the complete family inventory and copy exactly the nine inventoried
  product-extension payload paths without rewriting the candidate.
- **R8 (ubiquitous):** The staged manifest, cache bootstrap, MCP initialize
  version, qualification record, surface contract, inventory, both
  host-consumed skill contracts, and built bundle digest shall bind the same
  authority version and candidate bytes.
- **R9 (unwanted behavior):** If Codex E2E or canary evidence passes, the test
  layer shall not mutate product release, qualification, surface, support,
  tag, or history sources and shall not promote another surface.
- **R10 (state-driven):** While any SPEC-0001 v8 full-release condition is
  incomplete, Codex evidence shall remain bounded input and shall not
  authorize `wisp-v<version>`.
- **R11 (event-driven):** When candidate canary mode starts, it shall
  regenerate the typed candidate-validation receipt at `GITHUB_SHA`, require
  byte-digest equality with the captured dispatch input, bind every receipt
  subject to source/installed/evidence facts, and fail before Codex on any
  mismatch.
- **R12 (ubiquitous):** Deterministic E2E and candidate canary validation shall
  use the same release-metadata runtime digest and Stewards v2 extension
  protocol as SPEC-0001 v8, shall discover no ambient runtime, and shall not
  expose the validation store or product findings to the Wisp MCP/dashboard
  process or model.
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

## Verification matrix

| Contract area | Minimum evidence |
|---|---|
| Inventory-bound staging | Positive and omission/extra/mismatch fixtures run candidate validation with the explicit runtime store plus the inventory provider twice, hash the candidate bundle and both skill files, verify all fifteen public-contract fingerprints, and prove the cache receives exactly the nine declared bytes |
| Extension runtime | Container and canary fixtures prove the release-metadata digest, platform-matched immutable runtime object, repeated exact request/result protocol, typed receipt field, missing/mismatched/drifted/enforcement failures, no ambient fallback, cleanup before Codex, and no product-source mutation |
| Capability-safe artifacts | Positive fixtures cover one and multiple fragment/bearer occurrences in top-level and nested JSON strings for pass, fail, and inconclusive runs; byte comparisons prove exact sentinel replacement and otherwise-identical retained JSONL, scans cover transcript/evidence/logs, raw-output spies prove no tee or write, and injected transform/scan failures prove no artifact upload |
| Capability-safe browser failures | Playwright configuration inspection proves trace/video/screenshot/retry/file reporters and attachments are disabled; injected assertion, timeout, crash, signal, and cleanup failures at every browser stage place the observed capability in page URL, bearer, console, network, exception, and reporter inputs; sink spies prove interception precedes writes/logs, unsafe messages reduce only to the fixed error, the output directory receives no interval file, and the only allowed post-interval file has the exact scanned typed schema |
| Surface boundary | Fixtures prove staged `codex.local.interactive` identity/version/state, reject cross-surface evidence, and show E2E leaves source, generated support, and inventory files unchanged |
| Candidate canary | Driver/verifier fixtures regenerate the canonical typed candidate receipt, bind its captured SHA-256 and source commit plus the validator-runtime/metadata/inventory/public-contract/contract-snapshot/surface/qualification/candidate-state/skill-contract/README-support/bundle subjects to exact validated bytes and evidence, and fail before Codex on any mismatch |
| Release non-promotion | A passing Codex fixture with pending Claude, Node, dashboard, overall, approval, or derivative state creates no tag/history mutation and fails the complete release gate |

## Open questions

None.

## Rubric check

**PASS.** Against `specs/README.md` and the applicable structural checks
(1–7) from Trellis's shared artifact-contract rubric, frontmatter is complete;
ADR-0006, ADR-0007, SPEC-0001 v8, and the approved Stewards metadata spec v2
are declared; scope is bounded; repository, execution, inventory, evidence,
non-promotion, and cadence contracts are implementable; S1–S12 are GWT
scenarios; R1–R14 are EARS requirements; the verification matrix names
executable evidence; and no unresolved question is hidden.

## Gate record

Version 3 was approved on 2026-07-24 after the maintainer's family-rollout
intent act, spec-adversary `APPROVE-READY`, and conformance `PASS`. Version 4
does not reuse that approval for the new runtime-store, validator-digest, and
capability-safe artifact boundaries. The contract-author self-check above
gates this amendment;
independent intrinsic-quality and conformance review are owed before a human
approval act may move it from `gated` to `approved`.
