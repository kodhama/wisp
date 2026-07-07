// File-transport adapter for the Grove runtime bus (imperative shell).
// Lifted into kodhama/espial from the math-quest prototype
// (tools/espalier/viz/bus.ts) — see this repo's README for provenance.
// The bus is an append-only NDJSON file: crash-safe (a dying agent loses at
// most its own last line), greppable (fits "the repo is what agents see"),
// and multi-writer-safe enough for a session-hosted swarm (O_APPEND line
// writes). Other transports (GitHub comments for runner-hosted gardeners,
// HTTP POST) adapt behind the same GroveEvent schema.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseEvents, type GroveEvent, type ParseError } from "./protocol.ts";

export const DEFAULT_BUS_PATH = ".grove/runtime/events.ndjson";

/** Resolve the bus file: $GROVE_EVENTS or ./.grove/runtime/events.ndjson */
export function busPath(): string {
  return resolve(process.env.GROVE_EVENTS ?? DEFAULT_BUS_PATH);
}

export function appendEvent(path: string, event: GroveEvent): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(event) + "\n", "utf8");
}

export function readBus(path: string): { events: GroveEvent[]; errors: ParseError[] } {
  if (!existsSync(path)) return { events: [], errors: [] };
  return parseEvents(readFileSync(path, "utf8"));
}
