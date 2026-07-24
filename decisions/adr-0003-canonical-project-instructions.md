---
id: adr-0003-canonical-project-instructions
type: adr
status: approved
depends_on: []
owner: human
updated: 2026-07-23
---

# ADR-0003: `AGENTS.md` is the canonical project-instruction source

> **Human intent act (2026-07-23).** The maintainer asked for project rules to
> stop repeating across Claude and Codex, and required the result to tell
> Claude where future shared rules belong.

## Context

Wisp carried byte-identical project rules in `AGENTS.md` and `CLAUDE.md`.
Both hosts loaded the rules, but neither file was authoritative, so the next
edit could silently create drift.

Codex discovers `AGENTS.md` directly. Claude Code can import it with
`@AGENTS.md`. Trellis is a separate Claude-managed overlay and keeps its
existing block in `CLAUDE.md`.

## Decision

1. `AGENTS.md` is the sole source for project-wide instructions shared by
   Codex and Claude Code.
2. `CLAUDE.md` begins with the exact standalone adapter `@AGENTS.md`, followed
   by the existing Trellis-managed block. Other Claude-only rules belong in
   `.claude/rules/`.
3. New shared rules are added as unmarked prose in `AGENTS.md`.
4. Grove owns only its marked block and `.grove/` generated surfaces.
5. Trellis retains its managed import block in `CLAUDE.md`; active Trellis
   choices remain in `.trellis/rules.toml`.
6. A repository test guards the adapter, marker placement, and current
   configuration references.

## Consequences

- Shared project rules are edited once and loaded by both hosts.
- The adapter contains no duplicated shared project policy; Trellis remains in
  its existing Claude-managed location.
- Grove and Trellis can refresh their own regions without becoming writers of
  consumer prose or each other's managed blocks.

## Open questions

None.
