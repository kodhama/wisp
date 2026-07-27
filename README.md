# Archive — the Codex marketplace canary

**This branch is a reference archive, not a maintained branch.** It is not merged into
`main` and must not be. The driver loads and is executable (see *Running it*); its unit
tests are here to be read, not run.

Proposed for retirement from `kodhama/wisp` `main` on 2026-07-27, under a decision that is
**not yet ratified**. The mechanism is sound. It is being retired because the coverage
unique to it has narrowed: the per-pull-request container suite already proves the
seven-tool inventory, the bus write, authenticated dashboard health and project isolation
keylessly, and a keyless host check now proves the built package installs and starts on a
real host. What stays unique to the canary is prompt-driven, model-mediated host
behaviour, which no static check can reach.

**Corrections to an earlier version of this file.** It said the canary's *home* was wrong
because it tested "family distribution health, not a Wisp product concern". That framing
was refuted — the canary asserts bus writes and dashboard health under a real host, which
are Wisp product properties. It also asserted a successor "belongs in `kodhama/stewards`";
whether Stewards may own such a check is governed by `kodhama-0017` and is not settled.
Both claims are withdrawn.

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

## What replaces it, and what does not

**Already replaced, keylessly, on every pull request:** `scripts/keyless-host-check.mjs`
on `main` installs the built package through the real Claude plugin path and asserts the
host launches its MCP server. That covers marketplace install and host launch — for
Claude, at no API cost.

**Proposed, not committed:** [`kodhama/stewards#45`](https://github.com/kodhama/stewards/issues/45)
(keyless asset availability across every published plugin) and
[`#47`](https://github.com/kodhama/stewards/issues/47) (a live-session ping, which needs
`kodhama-0017` widened and is deferred). Neither is a commitment, and the retirement does
not depend on either landing.

**Not replaced by anything:** prompt-driven, model-mediated host behaviour, and the
Codex-side project binding that follows from an omitted `cwd`. Those are accepted losses,
named in the retirement decision rather than argued away.

## Contents

| Path | What |
|---|---|
| `.github/workflows/codex-canary.yml` | the workflow, cron + `workflow_dispatch` |
| `scripts/codex-canary.mjs` | the driver (780 lines) — arg parsing, isolated `CODEX_HOME`, session drive, assertions, redacted evidence |
| `scripts/codex-canary.d.mts` | its type surface |
| `scripts/capability-safety.mjs` + `.d.mts` | vendored: the driver imports four symbols from it |
| `package.json` | minimal, so the driver resolves as ESM |
| `test/e2e/codex-canary-driver-v2.unit.test.ts` | the driver's unit tests (753 lines) |
| `governing/adr-0006-codex-e2e-testing.md` | the decision that established reproducible Codex e2e |
| `governing/adr-0007-codex-canary-evidence.md` | the decision that shaped the canary's evidence |
| `governing/spec-0002-codex-e2e-testing.md` | the governing spec as of retirement |

## Running it

The driver imports `CAPABILITY_REDACTION_ERROR`, `DEFAULT_OUTPUT_LIMIT_BYTES`,
`extractCapabilities` and `writeSafeCanaryArtifacts` from `scripts/capability-safety.mjs`,
so that file is vendored here. With the minimal `package.json` the driver **loads and is
executable**; it is otherwise zero-dependency, using only `node:` builtins.

`test/e2e/codex-canary-driver-v2.unit.test.ts` needs `vitest`, which is not vendored —
that file is here to be read, not run.

## What did NOT come here

The **dashboard end-to-end suite stays on `main` and is unaffected** — `ci.yml`'s
`codex-e2e` job, `scripts/run-e2e-container.mjs`, `scripts/run-capability-safe-playwright.mjs`
and `test/e2e/codex-plugin.e2e.ts`. It drives the real Wisp dashboard on every pull
request at no API cost, and is not retired.

**Correction.** An earlier version of this file said `scripts/capability-safety.mjs` "was
never part of the canary". That was wrong — the driver imports four symbols from it, and
without it the archived driver failed to load at all. The file is genuinely shared:
`runSanitizedCommand` and `assertCapabilityAbsent` serve the dashboard suite and stay on
`main`, while `writeSafeCanaryArtifacts` — and `sanitizeCapabilityBytes`, which only it
calls — had the canary driver as their only production consumer.

A second correction: an earlier version also listed `extractCapabilities` and
`DEFAULT_OUTPUT_LIMIT_BYTES` as canary-only. **Both are wrong.**
`runSanitizedCommand` calls `extractCapabilities` directly (`capability-safety.mjs:429-430`)
and is bounded by `DEFAULT_OUTPUT_LIMIT_BYTES` (`:340`), and that function is the spine of
the surviving container and Playwright suites. Neither retires with the canary.
