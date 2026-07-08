# specs/

This repo's own specs — contract-layer artifacts for wisp's own
protocol, adapters, or tooling (e.g. a spec for a future transport
adapter or dashboard feature), written by a `contract-author` gardener
from an approved decision and never from a draft. Seeded minimal per
lane B4 of the kodhama suite-lift plan (grove installed as wisp's
operating model): this directory mirrors
[grove's own `specs/`](https://github.com/kodhama/grove/tree/main/specs)
shape, adapted, not a heavier process invented on top of it. wisp has
no dedicated spec-quality rubric file yet — self-check against the
artifact contract below (frontmatter present, `## Acceptance criteria`
testable, `## Open questions` present even if empty) until one is
warranted.

## Artifact contract

Every artifact in this repo (here, and in `decisions/`) begins with
YAML frontmatter:

```yaml
---
id: spec-short-slug       # kebab-case, prefixed by type
type: spec                # adr | spec | plan | rubric | ...
status: draft | gated | approved | superseded
depends_on: [adr-0000-...]   # ids of upstream artifacts this one builds on
owner: agent | human
updated: YYYY-MM-DD
---
```

- `draft` — not yet self-checked; not a valid downstream input. An
  `executor` gardener never implements against a `draft` spec.
- `gated` — self-checked against its rubric (if any); agent-consumable.
  The `spec-adversary` gardener runs against `gated` specs, before a
  human ever sees them.
- `approved` — ratified by human merge. Never set by hand.
- `superseded` — retired; a forward pointer names the replacement (see
  `decisions/README.md` for the append-only discipline this inherits).

Every spec must carry `## Acceptance criteria` (checkable) and
`## Open questions` (may be empty, but must exist) — a spec that
cannot say what "done" means is not yet a spec. A research artifact
(`type: discovery`, per the `divergent-researcher` gardener) is also
filed here, since wisp has no separate research-artifact directory.
