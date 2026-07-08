# wisp — grove-managed

<!-- grove:begin (managed by grove — edit .claude/agents/, not this block) -->
wisp is **grove-managed**: from lane B4 of the kodhama suite-lift plan
onward, wisp's own work items run as [grove](https://github.com/kodhama/grove)
furrows, not ad hoc prompting. The vendored gardener roles live in
`.claude/agents/` (eleven roles, wisp's placeholders already resolved —
test `npm test`, typecheck `npx tsc --noEmit`, GitHub PRs + issues on
`kodhama/wisp`, PR-first, agents never merge); the `grove-status`
telemetry skill lives in `.claude/skills/grove-status/`. Minimal
`decisions/` and `specs/` stores are seeded (mirroring grove's own,
adapted — see each dir's `README.md`).

**Recursion:** wisp IS the telemetry tool, so a gardener working here
reports through wisp's own `emit.ts` at the repo root, not a vendored
copy elsewhere — the `grove-status` skill's vendor path resolves to
`.`, and events land on wisp's own bus (`.grove/runtime/events.ndjson`).
<!-- grove:end -->

<!-- trellis:begin (managed by trellis — edit .trellis/, not this block) -->
This project follows **Trellis** — working rules you are expected to follow while you work here. They are imported below:
@.trellis/trellis.md
<!-- trellis:end -->
