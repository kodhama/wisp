# .claude/agents/ — vendored from grove

Ready-to-drop-in Claude Code subagent definitions, one per cold-started
agent role, vendored from [kodhama/grove](https://github.com/kodhama/grove)
(`.claude/agents/`) per grove's README §"Adopting grove in your project"
(lane B4 of the suite-lift plan). Each file's canonical charter — the
source of truth, carrying the provenance note — lives in grove's own
`charters/` at the URL cited inline in that file; these vendored copies
carry the `name`/`description`/`tools` frontmatter Claude Code expects
plus the charter's body.

**These copies are wisp-specific, not generic.** Every angle-bracketed
placeholder grove's originals declare (test command, typecheck command,
spec-rubric path, parked-item store, PR-contract sections, and so on)
has already been resolved to wisp's real values inline, the same way
math-quest's own vendored copies do it — no `## Placeholders` section
survives in these files; the resolved value sits where the token used
to be. See the B4 PR description for the full placeholder→value table.
Re-vendoring a newer grove revision means re-resolving placeholders
again, not a blind copy-over.

**`dispatcher.md` is scoped, not a full peer of the rest.** ADR-0030
charters head-gardener as "cold-started: the interactive session (v0)"
— sequencing a whole run requires state that survives across dozens of
dispatches, which a one-shot subagent invocation cannot hold. The
driving session remains the actual dispatcher across a run. This
file is a narrow one-shot advisor for two bounded sub-judgments
(workflow classification, next-dispatch recommendation) — see the
file's own "Why this file is narrower" section and
`https://github.com/kodhama/grove/blob/main/charters/dispatcher.md`
for the full role it does not replace.

| File | Stage | Role |
|---|---|---|
| `divergent-researcher.md` | 1 | research discipline; loud abort |
| `shaper.md` | 2 | decision canvases; never decides (interactive) |
| `contract-author.md` | 3 | specs from approved intent; never implements |
| `spec-adversary.md` | 3½ | breaks `gated` specs before human approval |
| `executor.md` | 4 | test-first implementation from artifacts only |
| `conformance-reviewer.md` | 4½ | build gate vs. approved upstream |
| `code-reviewer.md` | 4½ | code-quality gate vs. the project's declared standards; blocking ≥ high (objective harm only), rest advisory |
| `validator.md` | 5 | per-PR critique + triggered drift audits |
| `run-resumer.md` | remediation | resumes a run that died at its turn cap |
| `propagation-remediator.md` | remediation | writes an honest missing propagation section |
| `dispatcher.md` | dispatch | one-shot classify/next-dispatch advisor only — not a sequencer |
