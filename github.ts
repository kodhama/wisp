// GitHub comments adapter for the Grove runtime bus (imperative shell).
// Lane B3 of the kodhama suite-lift plan — "adapters: GitHub comments
// emitter (runner-hosted telemetry out), check-equivalent reader." Adapts
// the same GroveEvent schema bus.ts uses, for the case where the emitting
// agent and the consumer don't share a filesystem (a runner-hosted gardener
// posting telemetry a human or dashboard reads from GitHub instead of a
// local `.grove/` bus) — see bus.ts's header: "Other transports (GitHub
// comments for runner-hosted gardeners, HTTP POST) adapt behind the same
// GroveEvent schema."
//
// Genericity budget: grove is the reference consumer; this file
// generalizes only what falls out naturally (the { events, errors } shape
// already shared with bus.ts's readBus) — never speculatively. No adapter
// registry, no transport interface: just two functions and a small CLI,
// same shape as bus.ts + emit.ts.
//
// One batch = one GitHub issue comment: a marker line, then a fenced
// ```ndjson block with the events verbatim (one JSON object per line) —
// lossless, so the reader can round-trip it back through protocol.ts's
// parseEvents exactly.
//
// Usage (from the repo root; requires Node >= 22.18 for type stripping):
//   GITHUB_TOKEN=... WISP_GH_REPO=owner/repo WISP_GH_ISSUE=123 \
//     node github.ts emit   # mirror the local bus outward as one comment
//   GITHUB_TOKEN=... WISP_GH_REPO=owner/repo WISP_GH_ISSUE=123 \
//     node github.ts read   # print the read-back batch as NDJSON to stdout
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { busPath, readBus } from "./bus.ts";
import { parseEvents, type GroveEvent, type ParseError } from "./protocol.ts";

export const MARKER = "<!-- wisp-telemetry v1 -->";

const API_BASE = "https://api.github.com";

interface GithubConfig {
  token: string;
  owner: string;
  repo: string;
  issue: number;
}

function configFail(message: string): never {
  throw new Error(`github adapter: ${message}`);
}

/** Config via env: GITHUB_TOKEN (auth), WISP_GH_REPO (owner/repo), WISP_GH_ISSUE. */
export function githubConfig(): GithubConfig {
  const token = process.env.GITHUB_TOKEN;
  if (!token) configFail("GITHUB_TOKEN is required");

  const repoSpec = process.env.WISP_GH_REPO;
  if (!repoSpec) configFail("WISP_GH_REPO is required (owner/repo)");
  const [owner, repo] = repoSpec.split("/");
  if (!owner || !repo) configFail(`WISP_GH_REPO must be "owner/repo", got "${repoSpec}"`);

  const issueRaw = process.env.WISP_GH_ISSUE;
  if (!issueRaw) configFail("WISP_GH_ISSUE is required");
  const issue = Number(issueRaw);
  if (!Number.isInteger(issue) || issue <= 0) {
    configFail(`WISP_GH_ISSUE must be a positive integer, got "${issueRaw}"`);
  }

  return { token, owner, repo, issue };
}

/** Thin fetch wrapper: loud on non-2xx (status + a body excerpt), never swallowed. */
async function githubFetch(cfg: GithubConfig, path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${cfg.token}`,
      "x-github-api-version": "2022-11-28",
      ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    const excerpt = bodyText.slice(0, 500);
    throw new Error(
      `github api ${init.method ?? "GET"} ${path} failed: ${res.status} ${res.statusText} — ${excerpt}`,
    );
  }
  return res.json();
}

/** Format a batch of events as one marker-bearing comment body — lossless round-trip. */
export function formatComment(events: GroveEvent[]): string {
  const lines = events.map((e) => JSON.stringify(e));
  return [MARKER, "```ndjson", ...lines, "```", ""].join("\n");
}

function extractFencedBlock(body: string): string | undefined {
  const match = body.match(/```ndjson\n([\s\S]*?)```/);
  return match?.[1];
}

/**
 * Emitter: mirror the local bus (bus.ts's readBus/busPath — same file the
 * agent CLI, emit.ts, appends to) outward as one GitHub issue comment. One
 * call = one batch = one comment; this does not track what was already
 * mirrored, it snapshots whatever the local bus currently holds.
 */
export async function emitToGithub(): Promise<{ commentId: number; events: number }> {
  const cfg = githubConfig();
  const { events } = readBus(busPath());
  const body = formatComment(events);
  const created = (await githubFetch(
    cfg,
    `/repos/${cfg.owner}/${cfg.repo}/issues/${cfg.issue}/comments`,
    { method: "POST", body: JSON.stringify({ body }) },
  )) as { id: number };
  return { commentId: created.id, events: events.length };
}

interface GithubComment {
  id: number;
  body: string;
}

/**
 * Reader (`check`-equivalent): list the issue's comments (first page, up to
 * GitHub's 100-per-page max — pagination is unneeded until a run actually
 * emits that many batches, so it's left out rather than built speculatively),
 * keep only marker-bearing ones, and parse each fenced block through
 * protocol.ts's parseEvents.
 *
 * Returns the same { events, errors } shape as bus.ts's readBus. No marker
 * comments at all yields { events: [], errors: [] } — the same well-formed
 * empty result readBus gives for a bus file that doesn't exist yet (and,
 * for that matter, for one that exists but is empty: readBus doesn't
 * distinguish those two either). That shape is what feeds reduceTeamState's
 * vacuity guard (telemetry = events.length > 0); a fetch failure throws
 * instead of returning this shape, so "no telemetry yet" and "the read
 * itself failed" are never confused for one another.
 */
export async function readFromGithub(): Promise<{ events: GroveEvent[]; errors: ParseError[] }> {
  const cfg = githubConfig();
  const comments = (await githubFetch(
    cfg,
    `/repos/${cfg.owner}/${cfg.repo}/issues/${cfg.issue}/comments?per_page=100`,
  )) as GithubComment[];

  const events: GroveEvent[] = [];
  const errors: ParseError[] = [];
  for (const comment of comments) {
    if (!comment.body.startsWith(MARKER)) continue;
    const fenced = extractFencedBlock(comment.body);
    if (fenced === undefined) {
      errors.push({ line: 0, reason: `comment ${comment.id}: no fenced ndjson block found`, raw: comment.body });
      continue;
    }
    const parsed = parseEvents(fenced);
    events.push(...parsed.events);
    for (const err of parsed.errors) {
      errors.push({ ...err, reason: `comment ${comment.id}: ${err.reason}` });
    }
  }
  return { events, errors };
}

// ---------------------------------------------------------------------------
// CLI — same style as emit.ts: `node github.ts emit|read`.
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const [subcommand] = process.argv.slice(2);
  switch (subcommand) {
    case "emit": {
      const { commentId, events } = await emitToGithub();
      process.stdout.write(`emitted ${events} event(s) → issue comment ${commentId}\n`);
      break;
    }
    case "read": {
      const { events, errors } = await readFromGithub();
      if (errors.length > 0) {
        process.stderr.write(`warning: ${errors.length} malformed/unparseable entr${errors.length === 1 ? "y" : "ies"} on the github bus\n`);
      }
      for (const ev of events) process.stdout.write(JSON.stringify(ev) + "\n");
      break;
    }
    default:
      process.stderr.write("github.ts: usage: node github.ts emit|read\n");
      process.exit(2);
  }
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => {
    process.stderr.write(`github.ts: ${(e as Error).message}\n`);
    process.exit(1);
  });
}
