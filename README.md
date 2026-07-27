# Archive — the Codex marketplace canary

**This branch is a reference archive, not a maintained branch.** Nothing here runs.
It is not merged into `main` and must not be.

Retired from `kodhama/wisp` `main` on 2026-07-27. The mechanism was sound; its **home**
was wrong — it tested whether the published `@kodhama` marketplace still served an
installable plugin, which is family distribution health, not a Wisp product concern.
The successor belongs in `kodhama/stewards`, which owns the install door.

## What it did

A weekly GitHub Actions cron (`17 6 * * 1`, 20-minute cap) that, on a clean headless
Ubuntu runner:

1. pinned and asserted the Node 24 runtime;
2. installed the current stable Codex CLI (`npm install --global @openai/codex@latest`);
3. registered the **published** marketplace (`kodhama/stewards@main`) into an isolated
   `CODEX_HOME`;
4. installed the Wisp plugin from it and started a real Codex session;
5. asserted the session listed the representative MCP tools — `wisp_check`,
   `wisp_status`, `wisp_dashboard` — and that `wisp_dashboard` returned a well-formed
   URL; and
6. emitted redacted evidence (`codex.jsonl`, `evidence.json`) as a private artifact with
   30-day retention.

It ran with `continue-on-error` on the install and canary steps, then failed the job
explicitly, so an install failure and a behavioural failure stayed distinguishable.

## Why it is worth keeping as a reference

It is a **working example of a Codex marketplace being installed and exercised on a
headless CI runner** — isolated `CODEX_HOME`, no interactive `/plugin` step, real
session, structured assertions on tool availability. That pattern generalises: to a
Claude runner, and to several plugins in one run.

It is also the honest record of what such a check costs: it needs a real API key
(`secrets.CODEX_API_KEY`), so every fire spends money.

## What replaces it

`kodhama/stewards` issue — a family-level marketplace canary covering every published
plugin, on both hosts, with the **no-key asset-availability checks separated from the
key-spending live-session checks** so the cheap half can run often and the expensive
half rarely or on demand.

## Contents

| Path | What |
|---|---|
| `.github/workflows/codex-canary.yml` | the workflow, cron + `workflow_dispatch` |
| `scripts/codex-canary.mjs` | the driver (780 lines) — arg parsing, isolated `CODEX_HOME`, session drive, assertions, redacted evidence |
| `scripts/codex-canary.d.mts` | its type surface |
| `test/e2e/codex-canary-driver-v2.unit.test.ts` | the driver's unit tests (753 lines) |
| `governing/adr-0006-codex-e2e-testing.md` | the decision that established reproducible Codex e2e |
| `governing/adr-0007-codex-canary-evidence.md` | the decision that shaped the canary's evidence |
| `governing/spec-0002-codex-e2e-testing.md` | the governing spec as of retirement |

## What did NOT come here

The **dashboard end-to-end test stays on `main` and is unaffected** — `ci.yml`'s
`codex-e2e` job, `scripts/run-e2e-container.mjs`, `scripts/run-capability-safe-playwright.mjs`,
`scripts/capability-safety.mjs` and `test/e2e/codex-plugin.e2e.ts`. That is a Playwright
suite that drives the real Wisp dashboard on every pull request, at no API cost. It was
never part of the canary and is not retired.
