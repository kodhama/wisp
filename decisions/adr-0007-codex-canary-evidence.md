---
id: adr-0007-codex-canary-evidence
type: adr
status: approved
depends_on:
  - adr-0006-codex-e2e-testing
changes:
  - spec-0002-codex-e2e-testing@v2
owner: human
updated: 2026-07-24
---

# ADR-0007 — Align Codex canary evidence with observable host output

## Decision state

### Decided

- The deterministic installed-plugin gate owns the exact seven-tool inventory.
- The real Codex canary owns structured completed-call evidence for
  `wisp_check`, `wisp_status`, and `wisp_dashboard`, plus the exact bus write
  and live authenticated dashboard health.
- Both weekly and candidate modes install current stable Codex CLI.
- Headless MCP approvals use `approval_policy="on-request"` with
  `approvals_reviewer="auto_review"`. The canary never bypasses approvals or
  sandboxing.
- A current-Codex installation or other external dependency failure before
  any Wisp tool-call item is `inconclusive` weekly and `fail` for a candidate,
  while still producing the evidence artifact.

The maintainer ratified this amendment on 2026-07-24 by selecting this simpler
division of evidence over an app-server canary after reviewing the live-probe
constraint.

### Open

- None.

### Parked

- App-server inventory inspection, unless `codex exec --json` ceases to be a
  sufficient representative-call surface.

## Context

ADR-0006 required a real Codex canary to verify tool listing. A live probe
against `codex-cli 0.145.0` showed that `codex exec --json` emits structured
`mcp_tool_call` items but no startup tool-inventory event, matching upstream
Codex issue #17501. Requiring that unavailable event would make every
candidate fail despite successful host-mediated tool use.

The same probe showed that default noninteractive approval routing cancels an
MCP call. Running with `approval_policy="on-request"` and
`approvals_reviewer="auto_review"` completed the call without disabling the
sandbox. This preserves a risk-review boundary on the secret-bearing runner.

## Decision

Keep `codex exec --json` as the real-host canary surface. Require successful
structured completion records, with exact arguments and successful structured
results, for the representative read (`wisp_check`), write (`wisp_status`),
and explicit dashboard (`wisp_dashboard`) boundaries. The write must appear
at the fixture project's canonical bus, and the driver must authenticate a
health request while the Codex-owned MCP/dashboard process is still live.

The deterministic installed-plugin E2E continues to list and require all seven
tools. Together the two layers prove full candidate inventory and real Codex
host discovery without pretending that JSONL exposes an event it does not.

Both canary modes install current stable Codex before evaluating the plugin.
Installation failure is part of canary result precedence rather than an
unrecorded workflow failure: weekly records `inconclusive`; candidate records
`fail`. Candidate identity still requires the exact installed version and
bundle digest selected by ADR-0006.

Use Codex automatic approval review for the model-mediated calls. Do not use
`--dangerously-bypass-approvals-and-sandbox` or an equivalent approval
bypass.

## Rejected alternatives

- **Require the absent `tools[]` JSONL event:** impossible on the verified
  current host and therefore a permanent false failure.
- **Replace the canary with app-server:** capable of explicit inventory
  inspection, but materially more protocol machinery than the evidence gap
  warrants because deterministic E2E already owns complete inventory.
- **Disable approvals:** widens the runner trust boundary unnecessarily.

## Consequences

- The canary evidence matches observable Codex output and can pass honestly.
- Automatic review adds a small model-cost/latency increment to the weekly and
  pre-release runs.
- Tool inventory and real-host behavior remain complementary claims rather
  than one layer impersonating the other.

## Open questions

- None.
