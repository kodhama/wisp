# run-resumer addendum — wisp

Local rules the generic `grove:run-resumer` charter reads on top of its method
(`adr-0026` D3). Present-tense wisp facts; verify before relying.

## Finding a dead run's branch

wisp does **not** encode an issue number into branch names, so you cannot find
a run's branch by its issue. Branch names are a mix of `<category>/<slug>`
(e.g. `fix/…`, `docs/…`, `chore/…`) and bare `<slug>` (e.g.
`relations-rollout`). Locate a run's branch by **slug, not number**:
`git branch -r | grep <the run's own slug>`. Confirm the match against the
run's brief before resuming.
