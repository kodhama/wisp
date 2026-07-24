# wisp — grove-managed

## Maintaining project instructions

`AGENTS.md` is the canonical home for instructions shared by Codex and Claude
Code. Add new shared rules as unmarked prose here; do not repeat them in
`CLAUDE.md`, whose only shared-rule responsibility is importing this file.

Ownership remains local and explicit: edit Grove dials in `.grove/`, Trellis
rule activation in `.trellis/rules.toml`, and Claude-only instructions in
`.claude/rules/`. Do not hand-edit Grove's managed block below or Trellis's
managed block in `CLAUDE.md`.

<!-- grove:begin (managed by grove — dials live in .grove/, not this block) -->
Work items matching a grove workflow (W1–W6 — e.g. a bug report → the bug
pipeline, a research ask → divergent research) run as grove runs, sequenced
through grove's chartered agent roles, loaded from the grove plugin as
`grove:<role>` subagents (all thirteen). Anything else — conversation, trivial
asks, out-of-scope questions — proceeds normally. This repo's dials live in
`.grove/` (see its README). Version skew (adr-0026 D4): at role start, if the
installed grove plugin's version differs from the stamp below, disclose the
divergence loudly in your report and continue — the stamp is the in-repo
ratified record, never a lock; grove never enforces it.
grove plugin@0.1.0
<!-- grove:end -->
