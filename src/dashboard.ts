import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { constants as fsConstants, type Stats } from "node:fs";
import { lstat, mkdir, open, realpath, rename, rmdir, unlink } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { homedir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import type { Socket } from "node:net";
import type { Duplex } from "node:stream";
import { currentProcessIdentity, observeProcess, processInstanceIsGone } from "./process-identity.ts";
import { createRuntime, WispError, type WispRuntime } from "./runtime.ts";

export const DASHBOARD_PROTOCOL_VERSION = 1;
const HEALTH_TIMEOUT_MS = 500;
const CONVERGENCE_MS = 2_000;
const POLL_MS = 50;
const SHUTDOWN_GRACE_MS = 1_000;
const BODY_LIMIT = 32_768;
const backpressuredResponses = new WeakSet<ServerResponse>();

interface OwnerBase {
  schema: 1;
  protocol: 1;
  state: "starting" | "ready";
  project: string;
  project_key: string;
  instance: string;
  pid: number;
  process_identity: string;
  created_at: string;
}
interface StartingOwner extends OwnerBase { state: "starting" }
interface ReadyOwner extends OwnerBase {
  state: "ready";
  port: number;
  capability: string;
  published_at: string;
}
type OwnerRecord = StartingOwner | ReadyOwner;

export interface DashboardResult { url: string; reused: boolean }

export interface DashboardCoordinatorDependencies {
  clock?: {
    now(): number;
    sleep(milliseconds: number): Promise<void>;
  };
  healthProof?: (
    perform: () => Promise<void>,
    context: { role: "publisher" | "follower"; timeoutMs: number },
  ) => Promise<void>;
}

const systemClock = {
  now: () => Date.now(),
  sleep: (milliseconds: number) => delay(milliseconds),
};

export class DashboardCoordinator {
  readonly #project: string;
  readonly #runtime: WispRuntime;
  readonly #clock: NonNullable<DashboardCoordinatorDependencies["clock"]>;
  readonly #healthProof: NonNullable<DashboardCoordinatorDependencies["healthProof"]>;
  #server: Server | undefined;
  #record: ReadyOwner | undefined;
  #sockets = new Set<Socket>();
  #shuttingDown = false;
  #start: Promise<DashboardResult> | undefined;

  constructor(
    project: string,
    runtime: WispRuntime = createRuntime(project),
    dependencies: DashboardCoordinatorDependencies = {},
  ) {
    this.#project = project;
    this.#runtime = runtime;
    this.#clock = dependencies.clock ?? systemClock;
    this.#healthProof = dependencies.healthProof ?? ((perform) => perform());
  }

  start(): Promise<DashboardResult> {
    if (this.#shuttingDown) return Promise.reject(unavailable("ownership_contended", true));
    this.#start ??= this.#startOnce().finally(() => {
      if (this.#record === undefined) this.#start = undefined;
    });
    return this.#start;
  }

  async cleanup(): Promise<void> {
    if (this.#shuttingDown) return;
    this.#shuttingDown = true;
    await this.#start?.catch(() => undefined);
    await this.#closeListener();
    if (this.#record !== undefined) await removeMatchingOwner(this.#record).catch(() => undefined);
  }

  async #closeListener(): Promise<void> {
    const server = this.#server;
    if (server !== undefined) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          for (const socket of this.#sockets) socket.destroy();
        }, SHUTDOWN_GRACE_MS);
        timer.unref();
        server.close(() => {
          clearTimeout(timer);
          resolve();
        });
      });
      this.#server = undefined;
    }
  }

  async #startOnce(): Promise<DashboardResult> {
    const identity = await currentProcessIdentity();
    if (identity === undefined) throw unavailable("process_identity_unavailable", false);
    const location = await runtimeLocation(this.#project);
    const deadline = this.#clock.now() + CONVERGENCE_MS;
    let liveStarting = false;
    while (this.#clock.now() <= deadline) {
      const existing = await readOwner(location.ownerDir, location.ownerFile);
      if (existing !== undefined) {
        const reused = await inspectExisting(
          existing,
          location,
          this.#project,
          (owner) => this.#proveHealth(owner, "follower"),
        );
        if (reused !== undefined) return reused;
        liveStarting = existing.state === "starting" && await pathExists(location.ownerDir);
        await this.#clock.sleep(POLL_MS);
        continue;
      }
      liveStarting = false;
      const instance = randomUUID();
      const starting: StartingOwner = {
        schema: 1, protocol: 1, state: "starting",
        project: this.#project, project_key: location.projectKey,
        instance, pid: process.pid, process_identity: identity,
        created_at: new Date().toISOString(),
      };
      if (this.#shuttingDown) throw unavailable("ownership_contended", true);
      const candidate = `${location.ownerDir}.candidate-${instance}`;
      await mkdir(candidate, { mode: 0o700 });
      try {
        await writeRecord(join(candidate, "owner.json"), starting);
        await rename(candidate, location.ownerDir);
      } catch (error) {
        await cleanupDirectory(candidate);
        if (isCode(error, "EEXIST") || isCode(error, "ENOTEMPTY")) continue;
        throw unavailable("publish_failed", false);
      }
      try {
        const authoritative = await readOwner(location.ownerDir, location.ownerFile);
        if (!exactOwner(authoritative, starting)) {
          if (authoritative === undefined) throw unavailable("ownership_contended", true);
          const alternative = await inspectExisting(
            authoritative,
            location,
            this.#project,
            (owner) => this.#proveHealth(owner, "follower"),
          );
          if (alternative !== undefined) return alternative;
          throw unavailable(authoritative.state === "starting" ? "owner_starting" : "ownership_contended", true);
        }
        if (this.#shuttingDown) throw unavailable("ownership_contended", true);
        const capability = randomBytes(32).toString("base64url");
        const server = createDashboardServer(this.#runtime, location.projectKey, instance, capability, () => this.#shuttingDown);
        server.on("connection", (socket) => {
          this.#sockets.add(socket);
          socket.setTimeout(5_000, () => socket.destroy());
          socket.once("close", () => this.#sockets.delete(socket));
        });
        await new Promise<void>((resolve, reject) => {
          server.once("error", reject);
          server.listen(0, "127.0.0.1", () => resolve());
        }).catch(() => { throw unavailable("bind_failed", false); });
        server.unref();
        this.#server = server;
        const address = server.address();
        if (address === null || typeof address === "string") throw unavailable("bind_failed", false);
        const ready: ReadyOwner = {
          ...starting, state: "ready", port: address.port, capability,
          published_at: new Date().toISOString(),
        };
        if (this.#shuttingDown) throw unavailable("ownership_contended", true);
        await writeRecord(location.ownerFile, ready, true).catch(() => { throw unavailable("publish_failed", false); });
        this.#record = ready;
        const url = ownerUrl(ready);
        try {
          await this.#proveHealth(ready, "publisher");
        } catch {
          throw unavailable("owner_unhealthy", true);
        }
        return { url, reused: false };
      } catch (error) {
        await this.#closeListener();
        await removeMatchingOwner(this.#record ?? starting).catch(() => undefined);
        this.#record = undefined;
        throw error;
      }
    }
    throw unavailable(liveStarting ? "owner_starting" : "ownership_contended", true);
  }

  async #proveHealth(owner: ReadyOwner, role: "publisher" | "follower"): Promise<void> {
    await this.#healthProof(
      () => healthProof(owner),
      { role, timeoutMs: HEALTH_TIMEOUT_MS },
    );
  }
}

async function runtimeLocation(project: string): Promise<{
  projectKey: string; ownerDir: string; ownerFile: string;
}> {
  const home = await realpath(homedir()).catch(() => { throw unavailable("runtime_unsafe", false); });
  await assertPrivateDirectory(home);
  const root = join(home, ".wisp", "runtime", "dashboard");
  if (inside(project, root)) throw unavailable("project_contains_runtime", false);
  await ensurePrivateDirectory(join(home, ".wisp"));
  await ensurePrivateDirectory(join(home, ".wisp", "runtime"));
  await ensurePrivateDirectory(root);
  const projectKey = createHash("sha256").update(project, "utf8").digest("hex");
  const projectDir = join(root, projectKey);
  await ensurePrivateDirectory(projectDir);
  return { projectKey, ownerDir: join(projectDir, "owner"), ownerFile: join(projectDir, "owner", "owner.json") };
}

async function ensurePrivateDirectory(path: string): Promise<void> {
  try {
    await mkdir(path, { mode: 0o700 });
  } catch (error) {
    if (!isCode(error, "EEXIST")) throw unavailable("runtime_unsafe", false);
  }
  await assertPrivateDirectory(path);
}

async function assertPrivateDirectory(path: string): Promise<void> {
  const info = await lstat(path).catch(() => { throw unavailable("runtime_unsafe", false); });
  assertPrivateDirectoryInfo(info);
}

function assertPrivateDirectoryInfo(info: Stats): void {
  if (info.isSymbolicLink() || !info.isDirectory()) throw unavailable("runtime_unsafe", false);
  if (typeof info.uid === "number" && typeof process.getuid === "function" && info.uid !== process.getuid()) {
    throw unavailable("runtime_unsafe", false);
  }
  if ((info.mode & 0o022) !== 0) throw unavailable("runtime_unsafe", false);
}

async function inspectExisting(
  owner: OwnerRecord,
  location: { projectKey: string; ownerDir: string; ownerFile: string },
  project: string,
  proveHealth: (owner: ReadyOwner) => Promise<void>,
): Promise<DashboardResult | undefined> {
  if (owner.project !== project || owner.project_key !== location.projectKey) {
    throw unavailable("owner_identity_unverifiable", false);
  }
  const observed = await observeProcess(owner.pid);
  const gone = processInstanceIsGone(owner.process_identity, observed);
  if (gone === undefined) throw unavailable("owner_identity_unverifiable", false);
  if (gone) {
    await quarantineOwner(location.ownerDir, owner);
    return undefined;
  }
  if (owner.protocol !== DASHBOARD_PROTOCOL_VERSION) {
    throw new WispError("dashboard_version_conflict", "Dashboard protocol version conflicts", {
      expected_protocol: DASHBOARD_PROTOCOL_VERSION, actual_protocol: owner.protocol,
    });
  }
  if (owner.state === "starting") return undefined;
  try {
    await proveHealth(owner);
    return { url: ownerUrl(owner), reused: true };
  } catch {
    throw unavailable("owner_unhealthy", true);
  }
}

function createDashboardServer(
  runtime: WispRuntime,
  projectKey: string,
  instance: string,
  capability: string,
  shuttingDown: () => boolean,
): Server {
  let boundPort = 0;
  const acceptedAt = new WeakMap<Socket, number>();
  const headerTimers = new WeakMap<Socket, NodeJS.Timeout>();
  const server = createServer({ requestTimeout: 10_000, headersTimeout: 5_000, maxHeaderSize: 16_384 }, async (request, response) => {
    const headerTimer = headerTimers.get(request.socket);
    if (headerTimer !== undefined) clearTimeout(headerTimer);
    if (boundPort === 0) {
      const address = server.address();
      if (address !== null && typeof address !== "string") boundPort = address.port;
    }
    const origin = acceptedAt.get(request.socket) ?? performance.now();
    const remaining = Math.max(1, 10_000 - (performance.now() - origin));
    const totalTimer = setTimeout(() => {
      if (!response.headersSent) protocolError(response, 408, "http_request_timeout");
      else forceDestroySocket(request.socket);
    }, remaining);
    totalTimer.unref();
    response.once("finish", () => {
      if (!backpressuredResponses.has(response) && request.socket.writableLength === 0) clearTimeout(totalTimer);
      request.socket.once("data", () => {
        acceptedAt.set(request.socket, performance.now());
        armHeaderDeadline(request.socket);
      });
    });
    try {
      await route(request, response, runtime, projectKey, instance, capability, boundPort, shuttingDown);
    } catch (error) {
      if (!response.headersSent) respondWispError(response, error);
      else response.destroy();
    }
  });
  const armHeaderDeadline = (socket: Socket): void => {
    const prior = headerTimers.get(socket);
    if (prior !== undefined) clearTimeout(prior);
    const timer = setTimeout(() => {
      writeRawProtocolError(socket, 408, "http_request_timeout");
    }, 5_000);
    timer.unref();
    headerTimers.set(socket, timer);
  };
  server.on("connection", (socket) => {
    acceptedAt.set(socket, performance.now());
    armHeaderDeadline(socket);
    socket.once("close", () => {
      const timer = headerTimers.get(socket);
      if (timer !== undefined) clearTimeout(timer);
    });
  });
  server.on("clientError", (error, socket) => {
    if (!socket.writable) return;
    const candidate = error as Error & { code?: string };
    const status = candidate.code === "HPE_HEADER_OVERFLOW" ? 431 :
      candidate.code === "ERR_HTTP_REQUEST_TIMEOUT" ? 408 : 400;
    const code = status === 431 ? "http_headers_too_large" :
      status === 408 ? "http_request_timeout" : "http_invalid_request";
    writeRawProtocolError(socket, status, code);
  });
  server.keepAliveTimeout = 5_000;
  return server;
}

function writeRawProtocolError(socket: Duplex, status: number, code: string): void {
  if (!socket.writable) return;
  const body = JSON.stringify({ ok: false, error: { code } });
  socket.end(
    `HTTP/1.1 ${status} ${status === 431 ? "Request Header Fields Too Large" : status === 408 ? "Request Timeout" : "Bad Request"}\r\n` +
    `Content-Type: application/json; charset=utf-8\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
  );
}

function forceDestroySocket(socket: Socket): void {
  if (typeof socket.resetAndDestroy === "function") socket.resetAndDestroy();
  else socket.destroy();
}

async function route(
  request: IncomingMessage,
  response: ServerResponse,
  runtime: WispRuntime,
  projectKey: string,
  instance: string,
  capability: string,
  port: number,
  shuttingDown: () => boolean,
): Promise<void> {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  const hostValues = headerValues(request, "host");
  if (hostValues.length !== 1 || hostValues[0] !== `127.0.0.1:${port}`) return protocolError(response, 403, "http_forbidden");
  if (url.search !== "") return protocolError(response, 400, "http_invalid_request");
  const methods: Record<string, string> = { "/": "GET", "/api/health": "GET", "/api/events": "GET", "/api/commands": "POST" };
  const method = methods[url.pathname];
  if (method === undefined) return protocolError(response, 404, "http_not_found");
  if (request.method !== method) return protocolError(response, 405, "http_method_not_allowed");
  if (url.pathname !== "/") {
    const auth = headerValues(request, "authorization");
    if (auth.length !== 1 || !sameSecret(auth[0]!, `Bearer ${capability}`)) {
      return protocolError(response, 401, "http_unauthorized");
    }
    const origin = headerValues(request, "origin");
    const expected = `http://127.0.0.1:${port}`;
    if (origin.length > 1 || origin[0] !== undefined && origin[0] !== expected ||
      (url.pathname === "/api/commands" && origin.length !== 1)) {
      return protocolError(response, 403, "http_forbidden");
    }
    if (shuttingDown()) return protocolError(response, 503, "http_shutting_down");
  }
  if (request.method === "GET" && hasRequestBody(request)) {
    return protocolError(response, 400, "http_invalid_request");
  }
  if (url.pathname === "/") return htmlResponse(response, dashboardHtml());
  if (url.pathname === "/api/health") {
    return jsonResponse(response, 200, { ok: true, data: { protocol: 1, project_key: projectKey, instance } });
  }
  if (url.pathname === "/api/events") {
    return jsonResponse(response, 200, { ok: true, data: await runtime.dashboardEvents() });
  }
  const contentType = headerValues(request, "content-type");
  if (contentType.length !== 1 || contentType[0] !== "application/json") {
    return protocolError(response, 415, "http_unsupported_media_type");
  }
  const contentLength = headerValues(request, "content-length");
  if (
    contentLength.length > 1 ||
    contentLength.length === 1 && !/^(0|[1-9][0-9]*)$/u.test(contentLength[0]!)
  ) return protocolError(response, 400, "http_invalid_request");
  if (contentLength.length === 1 && Number(contentLength[0]) > BODY_LIMIT) {
    response.shouldKeepAlive = false;
    response.setHeader("Connection", "close");
    return protocolError(response, 413, "http_body_too_large");
  }
  const body = await readBody(request);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch {
    return protocolError(response, 400, "http_invalid_request");
  }
  const event = await runtime.issueCommand(value);
  return jsonResponse(response, 201, { ok: true, data: { event } });
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  return new Promise<Buffer>((resolve, reject) => {
    const timer = setTimeout(() => reject(new HttpFailure(408, "http_request_timeout")), 5_000);
    timer.unref();
    const fail = (error: unknown): void => { clearTimeout(timer); reject(error); };
    request.on("data", (chunk: Buffer | string) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += bytes.byteLength;
      if (total > BODY_LIMIT) {
        request.pause();
        fail(new HttpFailure(413, "http_body_too_large"));
      } else chunks.push(bytes);
    });
    request.once("end", () => { clearTimeout(timer); resolve(Buffer.concat(chunks)); });
    request.once("error", fail);
    request.once("aborted", () => fail(new HttpFailure(400, "http_invalid_request")));
  });
}

function hasRequestBody(request: IncomingMessage): boolean {
  const length = headerValues(request, "content-length");
  const transfer = headerValues(request, "transfer-encoding");
  return transfer.length > 0 || length.length > 0 && length[0] !== "0";
}

class HttpFailure extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

function respondWispError(response: ServerResponse, error: unknown): void {
  if (error instanceof HttpFailure) {
    if (error.status === 408) {
      response.shouldKeepAlive = false;
      response.setHeader("Connection", "close");
    }
    protocolError(response, error.status, error.code); return;
  }
  if (error instanceof WispError) {
    const status = error.code === "invalid_input" ? 400 : error.code === "command_conflict" ? 409 : 500;
    void jsonResponse(response, status, {
      ok: false, error: { code: error.code, message: error.message, details: error.details },
    }).catch(() => response.destroy()); return;
  }
  void jsonResponse(response, 500, {
    ok: false, error: { code: "internal_error", message: "Unexpected dashboard error", details: { incident_id: randomUUID() } },
  }).catch(() => response.destroy());
}

function protocolError(response: ServerResponse, status: number, code: string): void {
  void jsonResponse(response, status, { ok: false, error: { code } }).catch(() => response.destroy());
}

function commonHeaders(): Record<string, string> {
  return {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
}

async function jsonResponse(response: ServerResponse, status: number, value: unknown): Promise<void> {
  const body = Buffer.from(JSON.stringify(value), "utf8");
  response.writeHead(status, {
    ...commonHeaders(),
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": String(body.byteLength),
  });
  for (let offset = 0; offset < body.byteLength; offset += 262_144) {
    const chunk = body.subarray(offset, Math.min(offset + 262_144, body.byteLength));
    if (!response.write(chunk)) {
      backpressuredResponses.add(response);
      await new Promise<void>((resolve, reject) => {
        response.once("drain", resolve);
        response.once("error", reject);
        response.once("close", resolve);
      });
      if (response.destroyed) throw new Error("response closed");
    }
  }
  await new Promise<void>((resolve) => {
    response.once("close", resolve);
    response.end(resolve);
  });
}

function htmlResponse(response: ServerResponse, html: string): void {
  const nonce = randomBytes(18).toString("base64url");
  const body = html.replaceAll("__NONCE__", nonce);
  response.writeHead(200, {
    ...commonHeaders(),
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": `default-src 'none'; connect-src 'self'; img-src 'self' data:; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  });
  response.end(body);
}

function dashboardHtml(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Wisp</title>
<style>body{font:14px system-ui;margin:2rem;background:#101318;color:#eef}button,input,select,textarea{font:inherit}section{margin:1.5rem 0;padding:1rem;border:1px solid #39404d}article{margin:.5rem 0;padding:.5rem;background:#181d25}pre{white-space:pre-wrap}.error{color:#f88}.label{color:#9fb3ca}</style></head>
<body><h1>Wisp dashboard</h1><p id="status">Connecting…</p><form id="command"><label>Run <input name="run" required></label><label>Target <input name="target" placeholder="agent or *" required></label><label>Command <select name="type">${["pause","resume","abort","answer","gate","steer","dispatch"].map((x)=>`<option>${x}</option>`).join("")}</select></label><label>Payload for answer/gate/steer/dispatch <textarea name="payload" placeholder='JSON object (optional)'></textarea></label><button>Issue command</button></form><main id="view" aria-live="polite"></main>
<script nonce="__NONCE__">(()=>{const m=/^#capability=([A-Za-z0-9_-]{43})$/.exec(location.hash);history.replaceState(null,"",location.pathname);const cap=m&&m[1],status=document.querySelector("#status"),view=document.querySelector("#view"),form=document.querySelector("#command");let active=false,last=null;
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n};
const attr=(n,k,v)=>{n.setAttribute(k,String(v));return n};
const field=(parent,label,value,key)=>{if(value===undefined)return;const p=node("p");if(key)attr(p,"data-field",key);p.append(node("span",label+": ","label"),document.createTextNode(typeof value==="string"?value:JSON.stringify(value)));parent.append(p)};
const section=(title,name)=>{const s=attr(node("section"),"data-wisp-view",name);s.append(node("h2",title));view.append(s);return s};
const projectAgents=events=>{const runs=[];const byRun=new Map;for(const event of events){let run=byRun.get(event.run);if(!run){run={name:event.run,agents:[],byAgent:new Map};byRun.set(event.run,run);runs.push(run)}let agent=run.byAgent.get(event.agent);if(!agent){agent={name:event.agent};run.byAgent.set(event.agent,agent);run.agents.push(agent)}agent.last_seen=event.ts;if(event.kind==="status"){agent.state=event.state;if(Object.hasOwn(event,"activity"))agent.activity=event.activity;else delete agent.activity}if(event.kind==="verdict")agent.verdict=event.verdict}return runs};
const show=envelope=>{const data=envelope.data;view.replaceChildren();const life=section("Runs and agents","lifecycle");for(const run of projectAgents(data.events)){const r=node("article");r.append(node("h3","Run "+run.name));for(const agent of run.agents){const a=attr(attr(node("article"),"data-run",run.name),"data-agent",agent.name);a.append(node("h4","Agent "+agent.name));field(a,"Last seen",agent.last_seen,"last-seen");field(a,"State",agent.state,"state");field(a,"Activity",agent.activity,"activity");field(a,"Verdict",agent.verdict,"verdict");r.append(a)}life.append(r)}const timeline=section("Timeline","timeline");data.events.forEach((event,index)=>{const row=attr(node("article"),"data-event-index",index);field(row,"Position",index+1,"position");field(row,"Timestamp",event.ts,"timestamp");field(row,"Run",event.run,"run");field(row,"Agent",event.agent,"agent");field(row,"Kind",event.kind,"kind");field(row,"Event",event,"event");timeline.append(row)});const commands=section("Commands","commands");commands.append(node("p","Statuses: pending, accepted, rejected, completed","label"));for(const command of data.command_states){const row=attr(node("article"),"data-command-id",command.id);row.append(node("h3","Run "+command.run+" — "+command.status));field(row,"ID",command.id,"id");field(row,"Type",command.type,"type");field(row,"Target",command.target,"target");field(row,"Issued by",command.issued_by,"issued-by");field(row,"Issued at",command.issued_at,"issued-at");field(row,"Status",command.status,"command-status");field(row,"Payload",command.payload,"payload");commands.append(row)}const errors=section("Parse errors","parse-errors");for(const error of data.parse_errors){const row=attr(node("article"),"data-line",error.line);field(row,"Line",error.line,"line");field(row,"Reason",error.reason,"parse-reason");field(row,"Raw evidence",error.raw,"parse-raw");errors.append(row)}};
async function refresh(){if(active||!cap)return;active=true;try{const c=new AbortController(),t=setTimeout(()=>c.abort(),5000),r=await fetch("/api/events",{headers:{Authorization:"Bearer "+cap},signal:c.signal});clearTimeout(t);if(!r.ok)throw Error("refresh failed");const envelope=await r.json();last=envelope;show(envelope);status.textContent="Live";status.className=""}catch{status.textContent="Refresh failed";status.className="error";if(last)show(last)}finally{active=false}}
form.addEventListener("submit",async e=>{e.preventDefault();if(!cap)return;const b=form.querySelector("button");b.disabled=true;try{const d=new FormData(form),p=d.get("payload"),body={run:d.get("run"),target:d.get("target"),type:d.get("type")};if(p)body.payload=JSON.parse(p);const r=await fetch("/api/commands",{method:"POST",headers:{Authorization:"Bearer "+cap,"Content-Type":"application/json"},body:JSON.stringify(body)});if(!r.ok)throw Error("command failed");status.textContent="Command appended";await refresh()}catch{status.textContent="Command failed";status.className="error"}finally{b.disabled=false}});
document.addEventListener("visibilitychange",()=>{if(!document.hidden)refresh()});refresh();setInterval(()=>{if(!document.hidden)refresh()},2000)})();</script></body></html>`;
}

function headerValues(request: IncomingMessage, name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index]!.toLowerCase() === name) values.push(request.rawHeaders[index + 1]!);
  }
  return values;
}

function sameSecret(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
}

function ownerUrl(owner: ReadyOwner): string {
  return `http://127.0.0.1:${owner.port}/#capability=${owner.capability}`;
}

async function healthProof(owner: ReadyOwner): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const response = await fetch(`http://127.0.0.1:${owner.port}/api/health`, {
      headers: { Authorization: `Bearer ${owner.capability}`, Host: `127.0.0.1:${owner.port}` },
      signal: controller.signal,
    });
    const body = await response.json() as { ok?: unknown; data?: Record<string, unknown> };
    if (!response.ok || body.ok !== true || body.data?.protocol !== 1 ||
      body.data?.project_key !== owner.project_key || body.data?.instance !== owner.instance) throw new Error("health mismatch");
  } finally {
    clearTimeout(timer);
  }
}

async function writeRecord(path: string, record: OwnerRecord, replace = false): Promise<void> {
  const temporary = `${path}.tmp-${randomUUID()}`;
  const flags = fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL |
    (typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0);
  const handle = await open(temporary, flags, 0o600);
  try {
    try { await handle.writeFile(JSON.stringify(record), "utf8"); } finally { await handle.close(); }
    if (replace) await rename(temporary, path);
    else await rename(temporary, path);
  } catch (error) {
    await handle.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

async function readOwner(directory: string, path: string): Promise<OwnerRecord | undefined> {
  let directoryInfo: Stats;
  try {
    directoryInfo = await lstat(directory);
  } catch (error) {
    if (isCode(error, "ENOENT")) return undefined;
    throw unavailable("runtime_unsafe", false);
  }
  assertPrivateDirectoryInfo(directoryInfo);
  let info;
  try { info = await lstat(path); } catch (error) {
    if (isCode(error, "ENOENT")) return undefined;
    throw unavailable("runtime_unsafe", false);
  }
  if (
    info.isSymbolicLink() || !info.isFile() || (info.mode & 0o077) !== 0 ||
    (typeof info.uid === "number" && typeof process.getuid === "function" && info.uid !== process.getuid())
  ) throw unavailable("runtime_unsafe", false);
  try {
    const handle = await open(path, fsConstants.O_RDONLY | (typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0));
    try {
      const value = JSON.parse(await handle.readFile("utf8")) as Record<string, unknown>;
      if (!validOwner(value)) throw new Error("invalid");
      return value as unknown as OwnerRecord;
    } finally { await handle.close(); }
  } catch {
    throw unavailable("owner_identity_unverifiable", false);
  }
}

function validOwner(value: Record<string, unknown>): boolean {
  const base = ["schema","protocol","state","project","project_key","instance","pid","process_identity","created_at"];
  const keys = value.state === "ready" ? [...base, "port", "capability", "published_at"] : base;
  return Object.keys(value).sort().join(",") === keys.sort().join(",") &&
    value.schema === 1 && typeof value.protocol === "number" &&
    (value.state === "starting" || value.state === "ready") &&
    typeof value.project === "string" && isAbsolute(value.project) &&
    typeof value.project_key === "string" && /^[0-9a-f]{64}$/u.test(value.project_key) &&
    typeof value.instance === "string" && /^[0-9a-f-]{36}$/u.test(value.instance) &&
    typeof value.pid === "number" && Number.isInteger(value.pid) && value.pid > 0 &&
    typeof value.process_identity === "string" && value.process_identity.length > 0 &&
    typeof value.created_at === "string" && !Number.isNaN(Date.parse(value.created_at)) &&
    (value.state !== "ready" || (
      typeof value.port === "number" && Number.isInteger(value.port) && value.port > 0 && value.port <= 65535 &&
      typeof value.capability === "string" && /^[A-Za-z0-9_-]{43}$/u.test(value.capability) &&
      typeof value.published_at === "string" && !Number.isNaN(Date.parse(value.published_at))
    ));
}

function exactOwner(left: OwnerRecord | undefined, right: OwnerRecord): boolean {
  return left !== undefined && JSON.stringify(left) === JSON.stringify(right);
}

async function quarantineOwner(path: string, expected: OwnerRecord): Promise<void> {
  const current = await readOwner(path, join(path, "owner.json"));
  if (!exactOwner(current, expected)) return;
  const quarantine = `${path}.quarantine-${randomUUID()}`;
  await rename(path, quarantine).catch(() => undefined);
  void cleanupDirectory(quarantine);
}

async function removeMatchingOwner(expected: OwnerRecord): Promise<void> {
  const home = await realpath(homedir());
  const path = join(home, ".wisp", "runtime", "dashboard", expected.project_key, "owner");
  await quarantineOwner(path, expected);
}

async function cleanupDirectory(path: string): Promise<void> {
  await unlink(join(path, "owner.json")).catch(() => undefined);
  await rmdir(path).catch(() => undefined);
}

function unavailable(reason: string, retryable: boolean): WispError {
  return new WispError("dashboard_unavailable", "Wisp dashboard is unavailable", { reason, retryable });
}
function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
function inside(parent: string, child: string): boolean {
  const value = relative(parent, child);
  return value === "" || (!value.startsWith("..") && !isAbsolute(value));
}
function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
async function pathExists(path: string): Promise<boolean> {
  try { await lstat(path); return true; } catch { return false; }
}
