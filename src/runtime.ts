import {
  constants as fsConstants,
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  rmdir,
  unlink,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { currentProcessIdentity, observeProcess, processInstanceIsGone } from "./process-identity.ts";

export const PROTOCOL_VERSION = 1 as const;
export const BUS_RELATIVE_PATH = ".wisp/events.ndjson";
export const ROOTS_LIST_TIMEOUT_MS = 5_000;
export const LIMITS = Object.freeze({
  identifier: 128,
  verdict: 256,
  activity: 2_048,
  note: 2_048,
  question: 4_096,
  reference: 512,
  references: 32,
  event: 32_768,
  bus: 16_777_216,
  line: 65_536,
  commands: 1_000,
  parse_errors: 1_000,
});

export const AGENT_STATES = [
  "spawned",
  "working",
  "blocked",
  "awaiting_gate",
  "done",
  "failed",
] as const;
export const ACK_RESULTS = ["accepted", "rejected", "completed"] as const;
export const COMMAND_TYPES = ["pause", "resume", "abort", "answer", "gate", "steer", "dispatch"] as const;
export const EVENT_KINDS = ["status", "heartbeat", "verdict", "question", "command", "command_ack"] as const;

type ErrorCode =
  | "invalid_input"
  | "project_unresolved"
  | "bus_unreadable"
  | "bus_unwritable"
  | "bus_limit_exceeded"
  | "command_not_found"
  | "command_conflict"
  | "command_not_pending"
  | "command_not_targeted"
  | "dashboard_unavailable"
  | "dashboard_version_conflict"
  | "internal_error";

export class WispError extends Error {
  readonly code: ErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details: Record<string, unknown>) {
    super(message);
    this.name = "WispError";
    this.code = code;
    this.details = details;
  }
}

type JsonObject = { [key: string]: JsonValue };
type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
type AnyRecord = Record<string, unknown>;

export interface CanonicalEvent extends AnyRecord {
  v: 1;
  ts: string;
  run: string;
  agent: string;
  kind: (typeof EVENT_KINDS)[number];
}

export interface ParseErrorRecord {
  line: number;
  reason: "invalid_json" | "invalid_event";
  raw: string;
}

export interface PendingCommand {
  id: string;
  type: (typeof COMMAND_TYPES)[number];
  target: string;
  issued_by: string;
  issued_at: string;
  status: "pending";
  payload?: JsonObject;
}

function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function pointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function inputError(field: string, reason: string, extra: AnyRecord = {}): never {
  throw new WispError("invalid_input", "Invalid tool input", { field, reason, ...extra });
}

function ownRecord(value: unknown, field: string): AnyRecord {
  if (value === null) inputError(field, "null_not_allowed");
  if (typeof value !== "object" || Array.isArray(value)) inputError(field, "wrong_type");
  return value as AnyRecord;
}

function rejectUnknown(record: AnyRecord, allowed: readonly string[], field = ""): void {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) inputError(`${field}/${pointerSegment(key)}`, "unknown_property");
  }
}

function required(record: AnyRecord, key: string): unknown {
  if (!Object.hasOwn(record, key)) inputError(`/${pointerSegment(key)}`, "required");
  return record[key];
}

function boundedString(
  value: unknown,
  field: string,
  limit: number,
  options: { identifier?: boolean } = {},
): string {
  if (value === null) inputError(field, "null_not_allowed");
  if (typeof value !== "string") inputError(field, "wrong_type");
  const normalized = value.trim();
  if (normalized.length === 0) inputError(field, "blank");
  const control = options.identifier ? /[\u0000-\u001f\u007f]/u : /\u0000/u;
  if (control.test(normalized)) inputError(field, "control_character");
  const actual = utf8Bytes(normalized);
  if (actual > limit) inputError(field, "too_long", { limit, actual });
  return normalized;
}

function identifier(value: unknown, field: string): string {
  return boundedString(value, field, LIMITS.identifier, { identifier: true });
}

function optionalString(record: AnyRecord, key: string, limit: number): string | undefined {
  if (!Object.hasOwn(record, key)) return undefined;
  return boundedString(record[key], `/${pointerSegment(key)}`, limit);
}

function optionalIdentifier(record: AnyRecord, key: string): string | undefined {
  if (!Object.hasOwn(record, key)) return undefined;
  return identifier(record[key], `/${pointerSegment(key)}`);
}

function optionalRefs(record: AnyRecord): string[] | undefined {
  if (!Object.hasOwn(record, "refs")) return undefined;
  const value = record.refs;
  if (value === null) inputError("/refs", "null_not_allowed");
  if (!Array.isArray(value)) inputError("/refs", "wrong_type");
  if (value.length === 0) inputError("/refs", "blank");
  if (value.length > LIMITS.references) {
    inputError("/refs", "too_many", { limit: LIMITS.references, actual: value.length });
  }
  return value.map((item, index) => boundedString(item, `/refs/${index}`, LIMITS.reference));
}

function enumValue<T extends readonly string[]>(value: unknown, field: string, values: T): T[number] {
  if (value === null) inputError(field, "null_not_allowed");
  if (typeof value !== "string") inputError(field, "wrong_type");
  if (!values.includes(value)) inputError(field, "invalid_enum");
  return value as T[number];
}

function addressed(record: AnyRecord): { to?: string; meta?: { via: string } } {
  const to = optionalIdentifier(record, "to");
  const via = optionalIdentifier(record, "via");
  return {
    ...(to === undefined ? {} : { to }),
    ...(via === undefined ? {} : { meta: { via } }),
  };
}

const INPUT_KEYS: Record<string, readonly string[]> = {
  wisp_status: ["run", "agent", "state", "activity", "refs", "to", "via"],
  wisp_heartbeat: ["run", "agent", "to", "via"],
  wisp_verdict: ["run", "agent", "verdict", "activity", "refs", "to", "via"],
  wisp_question: ["run", "agent", "question_id", "text", "to", "via"],
  wisp_check: ["run", "agent"],
  wisp_ack: ["run", "agent", "command_id", "result", "note", "to", "via"],
  wisp_dashboard: [],
};

export function validateToolInput(tool: string, input: unknown): AnyRecord {
  const allowed = INPUT_KEYS[tool];
  if (allowed === undefined) inputError("", "invalid_enum");
  const record = ownRecord(input, "");
  rejectUnknown(record, allowed);
  if (tool === "wisp_dashboard") return record;
  const base = {
    run: identifier(required(record, "run"), "/run"),
    agent: identifier(required(record, "agent"), "/agent"),
  };

  switch (tool) {
    case "wisp_status": {
      const activity = optionalString(record, "activity", LIMITS.activity);
      const refs = optionalRefs(record);
      return {
        ...base,
        state: enumValue(required(record, "state"), "/state", AGENT_STATES),
        ...(activity === undefined ? {} : { activity }),
        ...(refs === undefined ? {} : { refs }),
        ...addressed(record),
      };
    }
    case "wisp_heartbeat":
      return { ...base, ...addressed(record) };
    case "wisp_verdict": {
      const activity = optionalString(record, "activity", LIMITS.activity);
      const refs = optionalRefs(record);
      return {
        ...base,
        verdict: boundedString(required(record, "verdict"), "/verdict", LIMITS.verdict),
        ...(activity === undefined ? {} : { activity }),
        ...(refs === undefined ? {} : { refs }),
        ...addressed(record),
      };
    }
    case "wisp_question":
      return {
        ...base,
        question_id: identifier(required(record, "question_id"), "/question_id"),
        text: boundedString(required(record, "text"), "/text", LIMITS.question),
        ...addressed(record),
      };
    case "wisp_check":
      return base;
    case "wisp_ack": {
      const result = Object.hasOwn(record, "result")
        ? enumValue(record.result, "/result", ACK_RESULTS)
        : "accepted";
      const note = optionalString(record, "note", LIMITS.note);
      return {
        ...base,
        command_id: identifier(required(record, "command_id"), "/command_id"),
        result,
        ...(note === undefined ? {} : { note }),
        ...addressed(record),
      };
    }
    default:
      inputError("", "invalid_enum");
  }
}

function storedFailure(): never {
  throw new WispError("invalid_input", "Invalid stored event", { field: "", reason: "wrong_type" });
}

function storedRecord(value: unknown): AnyRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) storedFailure();
  return value as AnyRecord;
}

function storedExact(record: AnyRecord, allowed: readonly string[]): void {
  if (Object.keys(record).some((key) => !allowed.includes(key))) storedFailure();
}

function storedId(value: unknown): string {
  if (typeof value !== "string") storedFailure();
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    /[\u0000-\u001f\u007f]/u.test(normalized) ||
    utf8Bytes(normalized) > LIMITS.identifier
  ) storedFailure();
  return normalized;
}

function storedText(value: unknown, limit: number): string {
  if (typeof value !== "string") storedFailure();
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.includes("\0") || utf8Bytes(normalized) > limit) storedFailure();
  return normalized;
}

function validTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
  const date = new Date(value);
  return !Number.isNaN(date.valueOf()) && date.toISOString() === value;
}

function validateMeta(value: unknown): { via: string } {
  const record = storedRecord(value);
  storedExact(record, ["via"]);
  if (!Object.hasOwn(record, "via")) storedFailure();
  return { via: storedId(record.via) };
}

function validateJson(value: unknown, seen = new Set<object>()): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.every((item) => validateJson(item, seen));
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  return Object.values(value as AnyRecord).every((item) => validateJson(item, seen));
}

export function validateStoredEvent(value: unknown): CanonicalEvent {
  const event = storedRecord(value);
  const common = ["v", "ts", "run", "agent", "kind"];
  if (event.v !== 1 || !validTimestamp(event.ts)) storedFailure();
  const run = storedId(event.run);
  const agent = storedId(event.agent);
  if (typeof event.kind !== "string" || !EVENT_KINDS.includes(event.kind as CanonicalEvent["kind"])) storedFailure();
  const kind = event.kind as CanonicalEvent["kind"];
  const normalized: CanonicalEvent = { v: 1, ts: event.ts, run, agent, kind };

  if (Object.hasOwn(event, "to")) normalized.to = storedId(event.to);
  if (Object.hasOwn(event, "meta")) normalized.meta = validateMeta(event.meta);

  switch (kind) {
    case "status": {
      storedExact(event, [...common, "state", "activity", "refs", "to", "meta"]);
      if (typeof event.state !== "string" || !AGENT_STATES.includes(event.state as (typeof AGENT_STATES)[number])) storedFailure();
      normalized.state = event.state;
      if (Object.hasOwn(event, "activity")) normalized.activity = storedText(event.activity, LIMITS.activity);
      if (Object.hasOwn(event, "refs")) normalized.refs = validateStoredRefs(event.refs);
      break;
    }
    case "heartbeat":
      storedExact(event, [...common, "to", "meta"]);
      break;
    case "verdict":
      storedExact(event, [...common, "verdict", "activity", "refs", "to", "meta"]);
      normalized.verdict = storedText(event.verdict, LIMITS.verdict);
      if (Object.hasOwn(event, "activity")) normalized.activity = storedText(event.activity, LIMITS.activity);
      if (Object.hasOwn(event, "refs")) normalized.refs = validateStoredRefs(event.refs);
      break;
    case "question": {
      storedExact(event, [...common, "question", "to", "meta"]);
      const question = storedRecord(event.question);
      storedExact(question, ["id", "text"]);
      normalized.question = {
        id: storedId(question.id),
        text: storedText(question.text, LIMITS.question),
      };
      break;
    }
    case "command": {
      storedExact(event, [...common, "command", "to", "meta"]);
      const command = storedRecord(event.command);
      storedExact(command, ["id", "type", "target", "payload"]);
      if (typeof command.type !== "string" || !COMMAND_TYPES.includes(command.type as (typeof COMMAND_TYPES)[number])) storedFailure();
      const body: AnyRecord = {
        id: storedId(command.id),
        type: command.type,
        target: storedId(command.target),
      };
      if (Object.hasOwn(command, "payload")) {
        const payload = command.payload;
        if (payload === null || typeof payload !== "object" || Array.isArray(payload) || !validateJson(payload)) storedFailure();
        body.payload = payload;
      }
      normalized.command = body;
      break;
    }
    case "command_ack": {
      storedExact(event, [...common, "ack", "to", "meta"]);
      const ack = storedRecord(event.ack);
      storedExact(ack, ["commandId", "result", "note"]);
      if (typeof ack.result !== "string" || !ACK_RESULTS.includes(ack.result as (typeof ACK_RESULTS)[number])) storedFailure();
      normalized.ack = {
        commandId: storedId(ack.commandId),
        result: ack.result,
        ...(Object.hasOwn(ack, "note") ? { note: storedText(ack.note, LIMITS.note) } : {}),
      };
      break;
    }
  }

  const actual = utf8Bytes(JSON.stringify(normalized));
  if (actual > LIMITS.event) storedFailure();
  return normalized;
}

export function createCanonicalEvent(input: AnyRecord, now: () => Date = () => new Date()): CanonicalEvent {
  const candidate = { v: 1, ts: now().toISOString(), ...input };
  let serialized: string;
  try {
    serialized = JSON.stringify(candidate);
  } catch {
    storedFailure();
  }
  const actual = utf8Bytes(serialized);
  if (actual > LIMITS.event) {
    throw new WispError("invalid_input", "Event exceeds byte limit", {
      field: "",
      reason: "event_too_large",
      limit: LIMITS.event,
      actual,
    });
  }
  return validateStoredEvent(candidate);
}

function validateStoredRefs(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > LIMITS.references) storedFailure();
  return value.map((item) => storedText(item, LIMITS.reference));
}

export function parseBusBytes(bytes: Uint8Array, path = ""): { events: CanonicalEvent[]; parse_errors: ParseErrorRecord[] } {
  if (bytes.byteLength > LIMITS.bus) {
    throw new WispError("bus_limit_exceeded", "Bus exceeds byte limit", {
      subject: "bus",
      unit: "utf8_bytes",
      limit: LIMITS.bus,
      actual: bytes.byteLength,
    });
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new WispError("bus_unreadable", "Bus is not valid UTF-8", { path, reason: "invalid_utf8" });
  }
  const events: CanonicalEvent[] = [];
  const parse_errors: ParseErrorRecord[] = [];
  const segments = text.split("\n");
  for (let index = 0; index < segments.length; index += 1) {
    let raw = segments[index] ?? "";
    if (raw.endsWith("\r")) raw = raw.slice(0, -1);
    const actual = utf8Bytes(raw);
    if (actual > LIMITS.line) {
      throw new WispError("bus_limit_exceeded", "Bus line exceeds byte limit", {
        subject: "line",
        unit: "utf8_bytes",
        limit: LIMITS.line,
        actual,
      });
    }
    if (raw.length === 0) continue;
    let decoded: unknown;
    try {
      decoded = JSON.parse(raw);
    } catch {
      parse_errors.push({ line: index + 1, reason: "invalid_json", raw });
      continue;
    }
    try {
      events.push(validateStoredEvent(decoded));
    } catch {
      parse_errors.push({ line: index + 1, reason: "invalid_event", raw });
    }
  }
  return { events, parse_errors };
}

function pathInside(project: string, candidate: string): boolean {
  const rel = relative(project, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function fsReason(error: unknown, fallback: string): string {
  return error instanceof Error && "code" in error && error.code === "ELOOP" ? "path_is_symlink" : fallback;
}

async function inspectOwnedPaths(
  project: string,
  mode: "read" | "write",
): Promise<{ directory: string; bus: string; busExists: boolean }> {
  const directory = join(project, ".wisp");
  const bus = join(directory, "events.ndjson");
  const code = mode === "read" ? "bus_unreadable" : "bus_unwritable";
  let dirExists = true;
  try {
    const info = await lstat(directory);
    if (info.isSymbolicLink()) throw new WispError(code, "Wisp directory is a symlink", { path: directory, reason: "path_is_symlink" });
    if (!info.isDirectory()) throw new WispError(code, "Wisp path is not a directory", { path: directory, reason: "path_not_directory" });
  } catch (error) {
    if (error instanceof WispError) throw error;
    if (error instanceof Error && "code" in error && error.code === "ENOENT") dirExists = false;
    else throw new WispError(code, "Cannot inspect Wisp directory", { path: directory, reason: "stat_failed" });
  }

  if (!dirExists && mode === "read") return { directory, bus, busExists: false };
  if (!dirExists) {
    try {
      await mkdir(directory);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) {
        throw new WispError("bus_unwritable", "Cannot create Wisp directory", { path: directory, reason: "mkdir_failed" });
      }
    }
    const created = await lstat(directory).catch(() => undefined);
    if (created === undefined || created.isSymbolicLink() || !created.isDirectory()) {
      throw new WispError("bus_unwritable", "Created Wisp path is unsafe", {
        path: directory,
        reason: created?.isSymbolicLink() ? "path_is_symlink" : "path_not_directory",
      });
    }
  }

  let canonicalDirectory: string;
  try {
    canonicalDirectory = await realpath(directory);
  } catch {
    throw new WispError(code, "Cannot resolve Wisp directory", { path: directory, reason: "stat_failed" });
  }
  if (!pathInside(project, canonicalDirectory) || dirname(bus) !== directory) {
    throw new WispError(code, "Bus is outside project", { path: bus, reason: "outside_project" });
  }

  try {
    const info = await lstat(bus);
    if (info.isSymbolicLink()) throw new WispError(code, "Bus is a symlink", { path: bus, reason: "path_is_symlink" });
    if (!info.isFile()) throw new WispError(code, "Bus is not a regular file", { path: bus, reason: "path_not_regular_file" });
    return { directory, bus, busExists: true };
  } catch (error) {
    if (error instanceof WispError) throw error;
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return { directory, bus, busExists: false };
    throw new WispError(code, "Cannot inspect bus", { path: bus, reason: "stat_failed" });
  }
}

async function readBus(project: string): Promise<{ events: CanonicalEvent[]; parse_errors: ParseErrorRecord[] }> {
  const checked = await inspectOwnedPaths(project, "read");
  if (!checked.busExists) return { events: [], parse_errors: [] };
  const flags = fsConstants.O_RDONLY |
    (typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0);
  let handle;
  try {
    handle = await open(checked.bus, flags);
  } catch (error) {
    throw new WispError("bus_unreadable", "Cannot open bus", {
      path: checked.bus,
      reason: fsReason(error, "open_failed"),
    });
  }
  let bytes: Buffer;
  try {
    let info;
    try {
      info = await handle.stat();
    } catch {
      throw new WispError("bus_unreadable", "Cannot stat bus", {
        path: checked.bus,
        reason: "stat_failed",
      });
    }
    if (!info.isFile()) {
      throw new WispError("bus_unreadable", "Bus is not a regular file", {
        path: checked.bus,
        reason: "path_not_regular_file",
      });
    }
    if (info.size > LIMITS.bus) {
      throw new WispError("bus_limit_exceeded", "Bus exceeds byte limit", {
        subject: "bus",
        unit: "utf8_bytes",
        limit: LIMITS.bus,
        actual: info.size,
      });
    }
    try {
      bytes = await handle.readFile();
    } catch {
      throw new WispError("bus_unreadable", "Cannot read bus", {
        path: checked.bus,
        reason: "read_failed",
      });
    }
  } finally {
    await handle.close().catch(() => undefined);
  }
  return parseBusBytes(bytes, checked.bus);
}

async function appendEventUnlocked(project: string, event: CanonicalEvent): Promise<void> {
  const serialized = JSON.stringify(validateStoredEvent(event));
  const actual = utf8Bytes(serialized);
  if (actual > LIMITS.event) {
    throw new WispError("invalid_input", "Event exceeds byte limit", {
      field: "",
      reason: "event_too_large",
      limit: LIMITS.event,
      actual,
    });
  }
  const checked = await inspectOwnedPaths(project, "write");
  const flags = fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_APPEND |
    (typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0);
  let handle;
  try {
    handle = await open(checked.bus, flags, 0o600);
  } catch (error) {
    throw new WispError("bus_unwritable", "Cannot open bus", {
      path: checked.bus,
      reason: fsReason(error, "open_failed"),
    });
  }
  let originalSize: number;
  try {
    const info = await handle.stat();
    if (!info.isFile()) {
      throw new WispError("bus_unwritable", "Bus is not a regular file", {
        path: checked.bus,
        reason: "path_not_regular_file",
      });
    }
    originalSize = info.size;
  } catch (error) {
    await handle.close().catch(() => undefined);
    if (error instanceof WispError) throw error;
    throw new WispError("bus_unwritable", "Cannot stat bus", { path: checked.bus, reason: "stat_failed" });
  }
  const bytes = Buffer.from(`${serialized}\n`, "utf8");
  const projected = originalSize + bytes.byteLength;
  if (projected > LIMITS.bus) {
    await handle.close().catch(() => undefined);
    throw new WispError("bus_limit_exceeded", "Bus exceeds byte limit", {
      subject: "bus",
      unit: "utf8_bytes",
      limit: LIMITS.bus,
      actual: projected,
    });
  }
  try {
    const { bytesWritten } = await handle.write(bytes, 0, bytes.byteLength, null);
    if (bytesWritten !== bytes.byteLength) throw new Error(`short append: ${bytesWritten}/${bytes.byteLength}`);
  } catch {
    await handle.truncate(originalSize).catch(() => undefined);
    throw new WispError("bus_unwritable", "Cannot append bus", {
      path: checked.bus,
      reason: "append_failed",
    });
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

const LOCK_STALE_MS = 120_000;
const LOCK_WAIT_MS = 5_000;
const RELEASE_SYNC_MS = 250;
const RELEASE_RETRY_MS = 10;
const committedTokens = new Set<string>();
let committedReleaseHorizonMs = LOCK_WAIT_MS;

export function setCommittedReleaseHorizonForTesting(milliseconds: number): void {
  committedReleaseHorizonMs = milliseconds;
}

export function hasCommittedTokenForTesting(token: string): boolean {
  return committedTokens.has(token);
}

interface LockOwner {
  token: string;
  pid: number;
  process_identity: string;
  created: number;
  phase: "held" | "committed";
}

async function withWriteLock<T>(project: string, operation: () => Promise<T>): Promise<T> {
  const { directory } = await inspectOwnedPaths(project, "write");
  const lockPath = join(directory, "write.lock");
  const ownerPath = join(lockPath, "owner.json");
  const token = randomUUID();
  const identity = await currentProcessIdentity();
  if (identity === undefined) {
    throw new WispError("bus_unwritable", "Process identity is unavailable", {
      path: lockPath,
      reason: "process_identity_unavailable",
    });
  }
  const deadline = Date.now() + LOCK_WAIT_MS;
  const owner: LockOwner = {
    token,
    pid: process.pid,
    process_identity: identity,
    created: Date.now(),
    phase: "held",
  };

  while (true) {
    try {
      await mkdir(lockPath, { mode: 0o700 });
      const ownerBytes = Buffer.from(JSON.stringify(owner), "utf8");
      const flags = fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL |
        (typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0);
      const handle = await open(ownerPath, flags, 0o600);
      try {
        const { bytesWritten } = await handle.write(ownerBytes, 0, ownerBytes.byteLength, null);
        if (bytesWritten !== ownerBytes.byteLength) throw new Error("short lock owner write");
      } finally {
        await handle.close().catch(() => undefined);
      }
      break;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) {
        await unlink(ownerPath).catch(() => undefined);
        await rmdir(lockPath).catch(() => undefined);
        throw new WispError("bus_unwritable", "Cannot acquire write lock", { path: lockPath, reason: "open_failed" });
      }
      const blocked = await readLockOwner(ownerPath).catch(() => undefined);
      if (
        blocked !== undefined && committedTokens.has(blocked.token) &&
        blocked.pid === process.pid && blocked.process_identity === identity
      ) {
        await releaseCommittedLock(lockPath, ownerPath, blocked, Date.now() + RELEASE_SYNC_MS, false);
        continue;
      }
      await recoverStaleLock(lockPath, ownerPath);
      if (Date.now() >= deadline) {
        throw new WispError("bus_unwritable", "Timed out acquiring write lock", { path: lockPath, reason: "open_failed" });
      }
      await delay(10);
    }
  }

  let committed = false;
  try {
    const result = await operation();
    committed = true;
    return result;
  } finally {
    if (committed) {
      owner.phase = "committed";
      const commitHorizon = Date.now() + committedReleaseHorizonMs;
      const released = await releaseCommittedLock(lockPath, ownerPath, owner, Date.now() + RELEASE_SYNC_MS);
      if (!released) {
        committedTokens.add(token);
        scheduleCommittedRelease(lockPath, ownerPath, owner, commitHorizon);
      }
    } else {
      await releaseHeldLock(lockPath, ownerPath, owner, Date.now() + RELEASE_SYNC_MS);
    }
  }
}

async function releaseCommittedLock(
  lockPath: string,
  ownerPath: string,
  owner: LockOwner,
  deadline: number,
  diagnose = true,
): Promise<boolean> {
  let stage: "phase_publish" | "release_rename" = "phase_publish";
  let diagnosed = false;
  while (Date.now() <= deadline) {
    try {
      stage = "phase_publish";
      const current = await readLockOwner(ownerPath);
      if (
        current.token !== owner.token || current.pid !== owner.pid ||
        current.process_identity !== owner.process_identity
      ) return false;
      if (current.phase !== "committed") await replaceLockOwner(ownerPath, owner);
      stage = "release_rename";
      const published = await readLockOwner(ownerPath);
      if (!sameLockOwner(published, owner)) return false;
      const retired = `${lockPath}.retired-${owner.token}`;
      await rename(lockPath, retired);
      committedTokens.delete(owner.token);
      scheduleRetiredCleanup(retired);
      return true;
    } catch {
      if (diagnose && !diagnosed) {
        releaseDiagnostic(stage);
        diagnosed = true;
      }
      await delay(RELEASE_RETRY_MS);
    }
  }
  if (diagnose && !diagnosed) releaseDiagnostic(stage);
  return false;
}

async function releaseHeldLock(
  lockPath: string,
  ownerPath: string,
  owner: LockOwner,
  deadline: number,
): Promise<void> {
  while (Date.now() <= deadline) {
    try {
      const current = await readLockOwner(ownerPath);
      if (!sameLockOwner(current, owner)) return;
      const retired = `${lockPath}.retired-${owner.token}`;
      await rename(lockPath, retired);
      scheduleRetiredCleanup(retired);
      return;
    } catch {
      await delay(RELEASE_RETRY_MS);
    }
  }
  releaseDiagnostic("release_rename");
}

function scheduleCommittedRelease(
  lockPath: string,
  ownerPath: string,
  owner: LockOwner,
  horizon: number,
): void {
  const worker = async (): Promise<void> => {
    if (Date.now() > horizon) {
      committedTokens.delete(owner.token);
      return;
    }
    if (!committedTokens.has(owner.token)) return;
    const released = await releaseCommittedLock(lockPath, ownerPath, owner, Date.now() + 45, false);
    if (!released && Date.now() <= horizon) {
      const timer = setTimeout(() => { void worker(); }, 50);
      timer.unref();
    } else if (!released) {
      committedTokens.delete(owner.token);
    }
  };
  const timer = setTimeout(() => { void worker(); }, 50);
  timer.unref();
}

function scheduleRetiredCleanup(path: string): void {
  const timer = setTimeout(async () => {
    if (!await cleanupLockDirectory(path)) releaseDiagnostic("retired_cleanup");
  }, 0);
  timer.unref();
}

function releaseDiagnostic(stage: "phase_publish" | "release_rename" | "retired_cleanup"): void {
  process.stderr.write(`wisp lock incident ${randomUUID()} stage=${stage}\n`);
}

export async function recoverStaleLock(lockPath: string, ownerPath: string): Promise<void> {
  let info;
  try {
    info = await lstat(lockPath);
  } catch {
    return;
  }
  if (info.isSymbolicLink()) {
    throw new WispError("bus_unwritable", "Write lock is a symlink", { path: lockPath, reason: "path_is_symlink" });
  }
  if (!info.isDirectory()) {
    throw new WispError("bus_unwritable", "Write lock is not a directory", { path: lockPath, reason: "path_not_directory" });
  }
  let dead = false;
  let owner: LockOwner | undefined;
  try {
    const ownerInfo = await lstat(ownerPath);
    if (ownerInfo.isSymbolicLink()) {
      throw new WispError("bus_unwritable", "Write-lock owner is a symlink", {
        path: ownerPath,
        reason: "path_is_symlink",
      });
    }
    if (!ownerInfo.isFile()) {
      throw new WispError("bus_unwritable", "Write-lock owner is not a regular file", {
        path: ownerPath,
        reason: "path_not_regular_file",
      });
    }
    owner = await readLockOwner(ownerPath);
    const observed = await observeProcess(owner.pid);
    const gone = processInstanceIsGone(owner.process_identity, observed);
    if (gone === undefined) return;
    dead = gone || (!gone && owner.phase === "committed");
  } catch (error) {
    if (error instanceof WispError) throw error;
    const created = await readMalformedOwnerCreated(ownerPath);
    dead = Date.now() - (created ?? info.mtimeMs) > LOCK_STALE_MS;
  }
  if (!dead) return;
  if (owner !== undefined) {
    let current: LockOwner;
    try { current = await readLockOwner(ownerPath); } catch { return; }
    if (!sameLockOwner(current, owner)) return;
  }
  const stale = `${lockPath}.stale-${randomUUID()}`;
  try {
    await rename(lockPath, stale);
  } catch {
    return;
  }
  await unlink(join(stale, "owner.json")).catch(() => undefined);
  await rmdir(stale).catch(() => undefined);
}

function sameLockOwner(left: LockOwner, right: LockOwner): boolean {
  return left.token === right.token && left.pid === right.pid &&
    left.process_identity === right.process_identity && left.created === right.created &&
    left.phase === right.phase;
}

async function readMalformedOwnerCreated(path: string): Promise<number | undefined> {
  const flags = fsConstants.O_RDONLY |
    (typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0);
  try {
    const handle = await open(path, flags);
    try {
      const value = JSON.parse(await handle.readFile("utf8")) as Record<string, unknown>;
      return typeof value.created === "number" &&
        Number.isFinite(value.created) && Number.isInteger(value.created) && value.created >= 0
        ? value.created
        : undefined;
    } finally {
      await handle.close();
    }
  } catch {
    return undefined;
  }
}

async function readLockOwner(path: string): Promise<LockOwner> {
  const flags = fsConstants.O_RDONLY |
    (typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0);
  const handle = await open(path, flags);
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error("lock owner is not a regular file");
    const value = JSON.parse(await handle.readFile("utf8")) as Record<string, unknown>;
    if (
      Object.keys(value).sort().join(",") !== "created,phase,pid,process_identity,token" ||
      typeof value.token !== "string" || !/^[0-9a-f-]{36}$/u.test(value.token) ||
      typeof value.pid !== "number" || !Number.isInteger(value.pid) || value.pid <= 0 ||
      typeof value.process_identity !== "string" || value.process_identity.length === 0 ||
      typeof value.created !== "number" || !Number.isInteger(value.created) || value.created < 0 ||
      (value.phase !== "held" && value.phase !== "committed")
    ) throw new Error("invalid lock owner");
    return value as unknown as LockOwner;
  } finally {
    await handle.close().catch(() => undefined);
  }
}

async function replaceLockOwner(path: string, owner: LockOwner): Promise<void> {
  const temporary = `${path}.tmp-${randomUUID()}`;
  const handle = await open(temporary, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL, 0o600);
  try {
    try {
      await handle.writeFile(JSON.stringify(owner), "utf8");
    } finally {
      await handle.close();
    }
    await rename(temporary, path);
  } catch (error) {
    await handle.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

async function cleanupLockDirectory(path: string): Promise<boolean> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await unlink(join(path, "owner.json")).catch(() => undefined);
      const entries = await readdir(path).catch(() => []);
      await Promise.all(entries
        .filter((entry) => entry.startsWith("owner.json.tmp-"))
        .map((entry) => unlink(join(path, entry)).catch(() => undefined)));
      await rmdir(path);
      return true;
    } catch {
      await delay(50);
    }
  }
  return false;
}

interface CommandState {
  event: CanonicalEvent;
  status: "pending" | (typeof ACK_RESULTS)[number];
}

export interface DashboardCommandState {
  run: string;
  id: string;
  type: (typeof COMMAND_TYPES)[number];
  target: string;
  issued_by: string;
  issued_at: string;
  status: "pending" | (typeof ACK_RESULTS)[number];
  payload?: JsonObject;
}

function commandStates(events: CanonicalEvent[], run: string): CommandState[] {
  const commands = events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.kind === "command" && event.run === run);
  const counts = new Map<string, number>();
  for (const { event } of commands) {
    const id = (event.command as AnyRecord).id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  for (const { event } of commands) {
    const id = (event.command as AnyRecord).id as string;
    const count = counts.get(id) ?? 0;
    if (count > 1) throw new WispError("command_conflict", "Command id is duplicated", { command_id: id, count });
  }
  return commands.map(({ event, index }) => {
    const id = (event.command as AnyRecord).id as string;
    let status: CommandState["status"] = "pending";
    for (let cursor = index + 1; cursor < events.length; cursor += 1) {
      const candidate = events[cursor]!;
      if (
        candidate.kind === "command_ack" &&
        candidate.run === run &&
        (candidate.ack as AnyRecord).commandId === id
      ) {
        status = (candidate.ack as AnyRecord).result as CommandState["status"];
      }
    }
    return { event, status };
  });
}

function commandStateForId(
  events: CanonicalEvent[],
  run: string,
  commandId: string,
): CommandState | undefined {
  const matches = events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) =>
      event.kind === "command" &&
      event.run === run &&
      (event.command as AnyRecord).id === commandId);
  if (matches.length > 1) {
    throw new WispError("command_conflict", "Command id is duplicated", {
      command_id: commandId,
      count: matches.length,
    });
  }
  const match = matches[0];
  if (match === undefined) return undefined;
  let status: CommandState["status"] = "pending";
  for (let index = match.index + 1; index < events.length; index += 1) {
    const candidate = events[index]!;
    if (
      candidate.kind === "command_ack" &&
      candidate.run === run &&
      (candidate.ack as AnyRecord).commandId === commandId
    ) {
      status = (candidate.ack as AnyRecord).result as CommandState["status"];
    }
  }
  return { event: match.event, status };
}

function stamp(now: () => Date, input: AnyRecord): CanonicalEvent {
  return createCanonicalEvent(input, now);
}

export function createRuntime(project: string, now: () => Date = () => new Date()) {
  const canonicalProject = realpath(resolve(project));
  return {
    async status(input: unknown): Promise<CanonicalEvent> {
      const args = validateToolInput("wisp_status", input);
      const event = stamp(now, { ...args, kind: "status" });
      const projectPath = await canonicalProject;
      await withWriteLock(projectPath, () => appendEventUnlocked(projectPath, event));
      return event;
    },
    async heartbeat(input: unknown): Promise<CanonicalEvent> {
      const args = validateToolInput("wisp_heartbeat", input);
      const event = stamp(now, { ...args, kind: "heartbeat" });
      const projectPath = await canonicalProject;
      await withWriteLock(projectPath, () => appendEventUnlocked(projectPath, event));
      return event;
    },
    async verdict(input: unknown): Promise<CanonicalEvent> {
      const args = validateToolInput("wisp_verdict", input);
      const event = stamp(now, { ...args, kind: "verdict" });
      const projectPath = await canonicalProject;
      await withWriteLock(projectPath, () => appendEventUnlocked(projectPath, event));
      return event;
    },
    async question(input: unknown): Promise<CanonicalEvent> {
      const args = validateToolInput("wisp_question", input);
      const { question_id, text, ...rest } = args;
      const event = stamp(now, { ...rest, kind: "question", question: { id: question_id, text } });
      const projectPath = await canonicalProject;
      await withWriteLock(projectPath, () => appendEventUnlocked(projectPath, event));
      return event;
    },
    async check(input: unknown): Promise<{ commands: PendingCommand[]; parse_errors: ParseErrorRecord[] }> {
      const args = validateToolInput("wisp_check", input);
      const parsed = await readBus(await canonicalProject);
      if (parsed.parse_errors.length > LIMITS.parse_errors) {
        throw new WispError("bus_limit_exceeded", "Too many parse errors", {
          subject: "parse_errors",
          unit: "items",
          limit: LIMITS.parse_errors,
          actual: parsed.parse_errors.length,
        });
      }
      const states = commandStates(parsed.events, args.run as string);
      const commands = states
        .filter(({ event, status }) => {
          const target = (event.command as AnyRecord).target;
          return status === "pending" && (target === args.agent || target === "*");
        })
        .map(({ event }) => {
          const body = event.command as AnyRecord;
          return {
            id: body.id as string,
            type: body.type as PendingCommand["type"],
            target: body.target as string,
            issued_by: event.agent,
            issued_at: event.ts,
            status: "pending" as const,
            ...(Object.hasOwn(body, "payload") ? { payload: body.payload as JsonObject } : {}),
          };
        });
      if (commands.length > LIMITS.commands) {
        throw new WispError("bus_limit_exceeded", "Too many pending commands", {
          subject: "commands",
          unit: "items",
          limit: LIMITS.commands,
          actual: commands.length,
        });
      }
      return { commands, parse_errors: parsed.parse_errors };
    },
    async ack(input: unknown): Promise<CanonicalEvent> {
      const args = validateToolInput("wisp_ack", input);
      const projectPath = await canonicalProject;
      return withWriteLock(projectPath, async () => {
        const parsed = await readBus(projectPath);
        const match = commandStateForId(parsed.events, args.run as string, args.command_id as string);
        if (match === undefined) {
          throw new WispError("command_not_found", "Command does not exist", { command_id: args.command_id });
        }
        if (match.status !== "pending") {
          throw new WispError("command_not_pending", "Command is already dispositioned", {
            command_id: args.command_id,
            status: match.status,
          });
        }
        const target = (match.event.command as AnyRecord).target as string;
        if (target !== args.agent && target !== "*") {
          throw new WispError("command_not_targeted", "Command targets another agent", {
            command_id: args.command_id,
            target,
            agent: args.agent,
          });
        }
        const { command_id, result, note, ...rest } = args;
        const event = stamp(now, {
          ...rest,
          kind: "command_ack",
          ack: {
            commandId: command_id,
            result,
            ...(note === undefined ? {} : { note }),
          },
        });
        await appendEventUnlocked(projectPath, event);
        return event;
      });
    },
    async dashboardEvents(): Promise<{
      events: CanonicalEvent[];
      parse_errors: ParseErrorRecord[];
      command_states: DashboardCommandState[];
    }> {
      const parsed = await readBus(await canonicalProject);
      if (parsed.parse_errors.length > LIMITS.parse_errors) {
        throw new WispError("bus_limit_exceeded", "Too many parse errors", {
          subject: "parse_errors", unit: "items", limit: LIMITS.parse_errors,
          actual: parsed.parse_errors.length,
        });
      }
      const runs: string[] = [];
      for (const event of parsed.events) {
        if (event.kind === "command" && !runs.includes(event.run)) runs.push(event.run);
      }
      const command_states = runs.flatMap((run) => commandStates(parsed.events, run).map(({ event, status }) => {
        const body = event.command as AnyRecord;
        return {
          run,
          id: body.id as string,
          type: body.type as DashboardCommandState["type"],
          target: body.target as string,
          issued_by: event.agent,
          issued_at: event.ts,
          status,
          ...(Object.hasOwn(body, "payload") ? { payload: body.payload as JsonObject } : {}),
        };
      }));
      if (command_states.length > LIMITS.commands) {
        throw new WispError("bus_limit_exceeded", "Too many commands", {
          subject: "commands", unit: "items", limit: LIMITS.commands, actual: command_states.length,
        });
      }
      return { ...parsed, command_states };
    },
    async issueCommand(input: unknown): Promise<CanonicalEvent> {
      const record = ownRecord(input, "");
      rejectUnknown(record, ["run", "type", "target", "payload"]);
      const run = identifier(required(record, "run"), "/run");
      const type = enumValue(required(record, "type"), "/type", COMMAND_TYPES);
      const target = identifier(required(record, "target"), "/target");
      let payload: JsonObject | undefined;
      if (Object.hasOwn(record, "payload")) {
        payload = ownRecord(record.payload, "/payload") as JsonObject;
      }
      const event = stamp(now, {
        run,
        agent: "maintainer",
        kind: "command",
        command: {
          id: `cmd-${randomUUID()}`,
          type,
          target,
          ...(payload === undefined ? {} : { payload }),
        },
      });
      const projectPath = await canonicalProject;
      await withWriteLock(projectPath, () => appendEventUnlocked(projectPath, event));
      return event;
    },
  };
}

export type WispRuntime = ReturnType<typeof createRuntime>;
