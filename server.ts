// Wisp runtime-viz server — zero-dependency imperative shell.
// Lifted into kodhama/espial from the math-quest prototype
// (tools/espalier/viz/server.ts) — see this repo's README for provenance.
// Serves the dashboard and a small JSON API over the file bus. Deliberately
// plain `node` (never vite-node: it loads .env.local into process.env — see
// CLAUDE.md §Local secrets; this server must not be able to see secrets).
//
// Usage below still shows the source repo's tools/espalier/viz/ path; from
// this repo's root, invoke as `node server.ts` (flat layout).
//   node tools/espalier/viz/server.ts            # http://localhost:4177
//   WISP_PORT=5000 node tools/espalier/viz/server.ts
//
// API:
//   GET  /api/state    → reduced TeamState + parse-error report
//   GET  /api/events   → raw events (feed/timeline), ?run= filter
//   POST /api/command  → { run, type, target, payload? } → appended command
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { appendEvent, busPath, readBus } from "./bus.ts";
import { deriveGraph, makeEvent, reduceTeamState, type CommandType } from "./protocol.ts";

const PORT = Number(process.env.WISP_PORT ?? 4177);
const HERE = dirname(fileURLToPath(import.meta.url));
let commandSeq = 0;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(payload);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  try {
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(readFileSync(join(HERE, "dashboard.html"), "utf8"));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/state") {
      const { events, errors } = readBus(busPath());
      const state = reduceTeamState(events, new Date().toISOString());
      // Parse errors ride along, loudly — a corrupt bus must be visible.
      sendJson(res, 200, { ...state, parseErrors: errors });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/events") {
      const { events } = readBus(busPath());
      const run = url.searchParams.get("run");
      const filtered = run ? events.filter((e) => e.run === run) : events;
      sendJson(res, 200, filtered.slice(-500));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/graph") {
      const { events } = readBus(busPath());
      const run = url.searchParams.get("run");
      if (run === null) {
        sendJson(res, 400, { error: "?run= is required" });
        return;
      }
      sendJson(res, 200, deriveGraph(events, run));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/command") {
      const body = JSON.parse(await readBody(req)) as {
        run?: string;
        type?: CommandType;
        target?: string;
        payload?: Record<string, unknown>;
        issuedBy?: string;
      };
      const id = `cmd-${Date.now()}-${++commandSeq}`;
      const event = makeEvent({
        ts: new Date().toISOString(),
        run: body.run ?? "",
        agent: body.issuedBy ?? "maintainer", // the dashboard is the human's channel
        kind: "command",
        command: { id, type: body.type as CommandType, target: body.target ?? "", payload: body.payload },
      });
      appendEvent(busPath(), event);
      sendJson(res, 201, event);
      return;
    }

    sendJson(res, 404, { error: `no route: ${req.method} ${url.pathname}` });
  } catch (e) {
    sendJson(res, 400, { error: (e as Error).message });
  }
});

server.listen(PORT, () => {
  process.stdout.write(
    `wisp on http://localhost:${PORT}  (bus: ${busPath()})\n`,
  );
});
