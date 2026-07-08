# decisions/

This repo's own architecture decision records (ADRs) — the intent-layer
artifacts for wisp itself (protocol/bus/adapter design choices, and
provenance/supersession pointers back to the math-quest prototype this
repo was lifted from — see the root `README.md` §Provenance and
ADR-0030). Seeded minimal per lane B4 of the kodhama suite-lift plan
(grove installed as wisp's operating model): this directory mirrors
[grove's own `decisions/`](https://github.com/kodhama/grove/tree/main/decisions)
shape, adapted, not a heavier process invented on top of it.

## Artifact contract

Every artifact in this repo (here, and in `specs/`) begins with YAML
frontmatter:

```yaml
---
id: adr-000x-short-slug   # kebab-case, prefixed by type
type: adr                 # adr | spec | plan | rubric | ...
status: draft | gated | approved | superseded
depends_on: [adr-0000-...]   # ids of upstream artifacts this one builds on
owner: agent | human
updated: YYYY-MM-DD
---
```

- `draft` — not yet self-checked; not a valid downstream input.
- `gated` — self-checked against its rubric (if any); agent-consumable.
- `approved` — ratified by human merge. Never set by hand.
- `superseded` — retired; a forward pointer names the replacement.

This is the same `draft → gated → approved (→ superseded)` vocabulary
wisp's own `.trellis/profile.md` already declares (trellis
decision-0037) — one vocabulary, not a second one invented here.

## Decisions are append-only

**Never edit a ratified (`approved`) decision in place.** To change one:
write a new decision, mark the old one `status: superseded` (or
`superseded in part` for a partial change), and add a one-line forward
pointer at the top of the superseded text naming the new decision's
`id`. No reader should ever land on stale text without a link forward
— this is how "why is it this way?" stays answerable later.
