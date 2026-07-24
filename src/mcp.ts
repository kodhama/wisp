import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { ProjectResolver } from "./project.ts";
import { DashboardCoordinator, type DashboardResult } from "./dashboard.ts";
import {
  ACK_RESULTS,
  AGENT_STATES,
  LIMITS,
  ROOTS_LIST_TIMEOUT_MS,
  WispError,
  createRuntime,
  validateToolInput,
  type WispRuntime,
} from "./runtime.ts";

export const TOOL_NAMES = [
  "wisp_status",
  "wisp_heartbeat",
  "wisp_verdict",
  "wisp_question",
  "wisp_check",
  "wisp_ack",
  "wisp_dashboard",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

type JsonSchema = Record<string, unknown>;

const identifier = schemaString(LIMITS.identifier, "identifier");
const activity = schemaString(LIMITS.activity, "activity");
const verdict = schemaString(LIMITS.verdict, "verdict");
const note = schemaString(LIMITS.note, "acknowledgement note");
const question = schemaString(LIMITS.question, "question");
const reference = schemaString(LIMITS.reference, "reference");
const refs = {
  type: "array",
  minItems: 1,
  maxItems: LIMITS.references,
  items: reference,
} as const;

function schemaString(maxUtf8Bytes: number, description: string): JsonSchema {
  return {
    type: "string",
    minLength: 1,
    maxLength: maxUtf8Bytes,
    description: `Nonblank ${description}, at most ${maxUtf8Bytes} UTF-8 bytes.`,
    "x-wisp-maxUtf8Bytes": maxUtf8Bytes,
  };
}

function objectSchema(
  required: readonly string[],
  properties: Record<string, JsonSchema | Readonly<Record<string, unknown>>>,
): JsonSchema {
  return { type: "object", required, properties, additionalProperties: false };
}

const addressProperties = {
  to: identifier,
  via: identifier,
};

const timestamp = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$" };
const meta = objectSchema(["via"], { via: identifier });
const eventBase = {
  v: { const: 1 },
  ts: timestamp,
  run: identifier,
  agent: identifier,
};
const eventSchema: JsonSchema = {
  oneOf: [
    objectSchema(["v", "ts", "run", "agent", "kind", "state"], {
      ...eventBase,
      kind: { const: "status" },
      state: { type: "string", enum: AGENT_STATES },
      activity,
      refs,
      to: identifier,
      meta,
    }),
    objectSchema(["v", "ts", "run", "agent", "kind"], {
      ...eventBase,
      kind: { const: "heartbeat" },
      to: identifier,
      meta,
    }),
    objectSchema(["v", "ts", "run", "agent", "kind", "verdict"], {
      ...eventBase,
      kind: { const: "verdict" },
      verdict,
      activity,
      refs,
      to: identifier,
      meta,
    }),
    objectSchema(["v", "ts", "run", "agent", "kind", "question"], {
      ...eventBase,
      kind: { const: "question" },
      question: objectSchema(["id", "text"], { id: identifier, text: question }),
      to: identifier,
      meta,
    }),
    objectSchema(["v", "ts", "run", "agent", "kind", "ack"], {
      ...eventBase,
      kind: { const: "command_ack" },
      ack: objectSchema(["commandId", "result"], {
        commandId: identifier,
        result: { type: "string", enum: ACK_RESULTS },
        note,
      }),
      to: identifier,
      meta,
    }),
  ],
};

const invalidInputReasons = [
  "required", "unknown_property", "null_not_allowed", "wrong_type", "blank",
  "control_character", "too_long", "too_many", "invalid_enum", "event_too_large", "cross_field",
];
const resolutionReasons = [
  "invalid_environment_root", "roots_unsupported", "roots_list_failed",
  "roots_absent", "roots_ambiguous", "invalid_file_root",
];
const readableBusReasons = [
  "path_is_symlink", "path_not_directory", "path_not_regular_file", "outside_project",
  "stat_failed", "open_failed", "read_failed", "invalid_utf8",
];
const writableBusReasons = [
  "path_is_symlink", "path_not_directory", "path_not_regular_file", "outside_project",
  "stat_failed", "mkdir_failed", "open_failed", "append_failed", "process_identity_unavailable",
];
const detailSchemas: Record<string, JsonSchema> = {
  invalid_input: objectSchema(["field", "reason"], {
    field: { type: "string" },
    reason: { type: "string", enum: invalidInputReasons },
    limit: { type: "number" },
    actual: { type: "number" },
  }),
  project_unresolved: objectSchema(["reason", "source"], {
    reason: { type: "string", enum: resolutionReasons },
    source: { type: "string", enum: ["environment", "roots"] },
  }),
  bus_unreadable: objectSchema(["path", "reason"], {
    path: { type: "string" },
    reason: { type: "string", enum: readableBusReasons },
  }),
  bus_unwritable: objectSchema(["path", "reason"], {
    path: { type: "string" },
    reason: { type: "string", enum: writableBusReasons },
  }),
  bus_limit_exceeded: objectSchema(["subject", "unit", "limit", "actual"], {
    subject: { type: "string", enum: ["bus", "line", "commands", "parse_errors"] },
    unit: { type: "string", enum: ["utf8_bytes", "items"] },
    limit: { type: "number" },
    actual: { type: "number" },
  }),
  command_not_found: objectSchema(["command_id"], { command_id: identifier }),
  command_conflict: objectSchema(["command_id", "count"], {
    command_id: identifier,
    count: { type: "integer", minimum: 2 },
  }),
  command_not_pending: objectSchema(["command_id", "status"], {
    command_id: identifier,
    status: { type: "string", enum: ACK_RESULTS },
  }),
  command_not_targeted: objectSchema(["command_id", "target", "agent"], {
    command_id: identifier,
    target: identifier,
    agent: identifier,
  }),
  dashboard_unavailable: objectSchema(["reason", "retryable"], {
    reason: { type: "string", enum: [
      "runtime_unsafe", "project_contains_runtime", "process_identity_unavailable",
      "owner_identity_unverifiable", "bind_failed", "publish_failed", "owner_starting",
      "owner_unhealthy", "ownership_contended",
    ] },
    retryable: { type: "boolean" },
  }),
  dashboard_version_conflict: objectSchema(["expected_protocol", "actual_protocol"], {
    expected_protocol: { const: 1 },
    actual_protocol: { type: "integer" },
  }),
  internal_error: objectSchema(["incident_id"], { incident_id: { type: "string" } }),
};
const errorSchema: JsonSchema = {
  oneOf: Object.entries(detailSchemas).map(([code, details]) =>
    objectSchema(["code", "message", "details"], {
      code: { const: code },
      message: { type: "string" },
      details,
    })),
};

const commandSchema = objectSchema(
  ["id", "type", "target", "issued_by", "issued_at", "status"],
  {
    id: identifier,
    type: { type: "string", enum: ["pause", "resume", "abort", "answer", "gate", "steer", "dispatch"] },
    target: identifier,
    issued_by: identifier,
    issued_at: timestamp,
    status: { const: "pending" },
    payload: { type: "object", additionalProperties: true },
  },
);
const parseErrorSchema = objectSchema(["line", "reason", "raw"], {
  line: { type: "integer", minimum: 1 },
  reason: { type: "string", enum: ["invalid_json", "invalid_event"] },
  raw: { type: "string" },
});
const checkDataSchema = objectSchema(["commands", "parse_errors"], {
  commands: { type: "array", maxItems: LIMITS.commands, items: commandSchema },
  parse_errors: { type: "array", maxItems: LIMITS.parse_errors, items: parseErrorSchema },
});
const writeDataSchema = objectSchema(["event"], { event: eventSchema });
const dashboardDataSchema = objectSchema(["url", "reused"], {
  url: { type: "string", pattern: "^http://127\\.0\\.0\\.1:[1-9][0-9]*/#capability=[A-Za-z0-9_-]{43}$" },
  reused: { type: "boolean" },
});

function envelopeSchema(data: JsonSchema): JsonSchema {
  return {
    type: "object",
    oneOf: [
      objectSchema(["ok", "data"], { ok: { const: true }, data }),
      objectSchema(["ok", "error"], { ok: { const: false }, error: errorSchema }),
    ],
  };
}

const definitions: readonly Tool[] = [
  {
    name: "wisp_status",
    description: "Report an actual lifecycle state transition.",
    inputSchema: objectSchema(["run", "agent", "state"], {
      run: identifier,
      agent: identifier,
      state: { type: "string", enum: AGENT_STATES },
      activity,
      refs,
      ...addressProperties,
    }) as Tool["inputSchema"],
    outputSchema: envelopeSchema(writeDataSchema) as Tool["outputSchema"],
  },
  {
    name: "wisp_heartbeat",
    description: "Report liveness without changing lifecycle state.",
    inputSchema: objectSchema(["run", "agent"], {
      run: identifier,
      agent: identifier,
      ...addressProperties,
    }) as Tool["inputSchema"],
    outputSchema: envelopeSchema(writeDataSchema) as Tool["outputSchema"],
  },
  {
    name: "wisp_verdict",
    description: "Report a consumer-defined verdict.",
    inputSchema: objectSchema(["run", "agent", "verdict"], {
      run: identifier,
      agent: identifier,
      verdict,
      activity,
      refs,
      ...addressProperties,
    }) as Tool["inputSchema"],
    outputSchema: envelopeSchema(writeDataSchema) as Tool["outputSchema"],
  },
  {
    name: "wisp_question",
    description: "Report a question that needs attention.",
    inputSchema: objectSchema(["run", "agent", "question_id", "text"], {
      run: identifier,
      agent: identifier,
      question_id: identifier,
      text: question,
      ...addressProperties,
    }) as Tool["inputSchema"],
    outputSchema: envelopeSchema(writeDataSchema) as Tool["outputSchema"],
  },
  {
    name: "wisp_check",
    description: "Read pending commands addressed to this agent and malformed-line evidence.",
    inputSchema: objectSchema(["run", "agent"], { run: identifier, agent: identifier }) as Tool["inputSchema"],
    outputSchema: envelopeSchema(checkDataSchema) as Tool["outputSchema"],
  },
  {
    name: "wisp_ack",
    description: "Acknowledge one pending command after handling it.",
    inputSchema: objectSchema(["run", "agent", "command_id"], {
      run: identifier,
      agent: identifier,
      command_id: identifier,
      result: { type: "string", enum: ACK_RESULTS, default: "accepted" },
      note,
      ...addressProperties,
    }) as Tool["inputSchema"],
    outputSchema: envelopeSchema(writeDataSchema) as Tool["outputSchema"],
  },
  {
    name: "wisp_dashboard",
    description: "Start or reuse the authenticated Wisp dashboard for this project.",
    inputSchema: objectSchema([], {}) as Tool["inputSchema"],
    outputSchema: envelopeSchema(dashboardDataSchema) as Tool["outputSchema"],
  },
] as const;

export function createToolDefinitions(): readonly Tool[] {
  return structuredClone(definitions);
}

interface Resolver {
  resolve(): Promise<string>;
}

type ToolRuntime = Pick<WispRuntime, "status" | "heartbeat" | "verdict" | "question" | "check" | "ack">;
type RuntimeFactory = (project: string) => ToolRuntime;
type DashboardFactory = (project: string) => { start(): Promise<DashboardResult> };
type Diagnostic = (message: string) => void;

export async function callWispTool(
  name: string,
  args: unknown,
  resolver: Resolver,
  runtimeFactory: RuntimeFactory = createRuntime,
  diagnostic: Diagnostic = (message) => process.stderr.write(`${message}\n`),
  dashboardFactory: DashboardFactory = (project) => new DashboardCoordinator(project),
): Promise<CallToolResult> {
  try {
    if (!TOOL_NAMES.includes(name as ToolName)) {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    validateToolInput(name, args);
    const project = await resolver.resolve();
    const runtime = runtimeFactory(project);
    let data: Record<string, unknown>;
    switch (name as ToolName) {
      case "wisp_status":
        data = { event: await runtime.status(args) };
        break;
      case "wisp_heartbeat":
        data = { event: await runtime.heartbeat(args) };
        break;
      case "wisp_verdict":
        data = { event: await runtime.verdict(args) };
        break;
      case "wisp_question":
        data = { event: await runtime.question(args) };
        break;
      case "wisp_check":
        data = await runtime.check(args);
        break;
      case "wisp_ack":
        data = { event: await runtime.ack(args) };
        break;
      case "wisp_dashboard":
        data = { ...await dashboardFactory(project).start() };
        break;
    }
    return toolResult({ ok: true, data }, false);
  } catch (error) {
    if (error instanceof McpError) throw error;
    if (error instanceof WispError) {
      return toolResult(
        { ok: false, error: { code: error.code, message: error.message, details: error.details } },
        true,
      );
    }
    const incident = randomUUID();
    diagnostic(`wisp internal error (${incident}): ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    return toolResult(
      {
        ok: false,
        error: {
          code: "internal_error",
          message: "An unexpected Wisp error occurred",
          details: { incident_id: incident },
        },
      },
      true,
    );
  }
}

function toolResult(envelope: Record<string, unknown>, isError: boolean): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(envelope) }],
    structuredContent: envelope,
    isError,
  };
}

const cleanupByServer = new WeakMap<Server, Promise<void>>();

export function createWispServer(environmentRoot = process.env.WISP_PROJECT_ROOT): Server {
  const server = new Server(
    { name: "wisp", version: "0.2.0" },
    { capabilities: { tools: {} } },
  );
  let resolver: ProjectResolver | undefined;
  let dashboard: DashboardCoordinator | undefined;
  let resolveCleanup!: () => void;
  const cleanupComplete = new Promise<void>((resolve) => { resolveCleanup = resolve; });
  cleanupByServer.set(server, cleanupComplete);
  const getResolver = (): ProjectResolver => {
    resolver ??= new ProjectResolver(
      environmentRoot,
      server.getClientCapabilities()?.roots !== undefined,
      async () =>
        (await server.listRoots({}, { timeout: ROOTS_LIST_TIMEOUT_MS })).roots.map(({ uri, name }) => ({
          uri,
          ...(name === undefined ? {} : { name }),
        })),
    );
    return resolver;
  };

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: createToolDefinitions() }));
  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    callWispTool(
      request.params.name,
      request.params.arguments ?? {},
      getResolver(),
      createRuntime,
      (message) => process.stderr.write(`${message}\n`),
      (project) => dashboard ??= new DashboardCoordinator(project),
    ),
  );
  server.onclose = () => {
    void (dashboard?.cleanup() ?? Promise.resolve()).finally(resolveCleanup);
  };
  return server;
}

export function waitForWispCleanup(server: Server): Promise<void> {
  return cleanupByServer.get(server) ?? Promise.resolve();
}

export async function startStdioServer(): Promise<void> {
  const server = createWispServer();
  const shutdown = (): void => {
    void server.close().then(() => waitForWispCleanup(server));
  };
  process.stdin.once("end", shutdown);
  process.stdin.once("close", shutdown);
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  await server.connect(new StdioServerTransport());
  await waitForWispCleanup(server);
  process.stdin.removeListener("end", shutdown);
  process.stdin.removeListener("close", shutdown);
  process.removeListener("SIGINT", shutdown);
  process.removeListener("SIGTERM", shutdown);
}
