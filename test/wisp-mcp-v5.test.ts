// SPEC-0001 v6: S11, S13, S17-S19, S22, S32 / R13-R23.
import { describe, expect, it, vi } from "vitest";
import { TOOL_NAMES, callWispTool, createToolDefinitions } from "../src/mcp.ts";
import { WispError } from "../src/runtime.ts";

const resolved = { resolve: vi.fn().mockResolvedValue("/project") };

function runtime() {
  return {
    status: vi.fn().mockResolvedValue({ kind: "status" }),
    heartbeat: vi.fn().mockResolvedValue({ kind: "heartbeat" }),
    verdict: vi.fn().mockResolvedValue({ kind: "verdict" }),
    question: vi.fn().mockResolvedValue({ kind: "question" }),
    check: vi.fn().mockResolvedValue({ commands: [], parse_errors: [] }),
    ack: vi.fn().mockResolvedValue({ kind: "command_ack" }),
  };
}

describe("SPEC-0001 S11/S13/S17/S22 — exact MCP boundary", () => {
  it("exposes exactly seven strict tool definitions and no MCP command-issuance tool", () => {
    expect(TOOL_NAMES).toEqual([
      "wisp_status",
      "wisp_heartbeat",
      "wisp_verdict",
      "wisp_question",
      "wisp_check",
      "wisp_ack",
      "wisp_dashboard",
    ]);
    const definitions = createToolDefinitions();
    expect(definitions.map((tool) => tool.name)).toEqual(TOOL_NAMES);
    for (const tool of definitions) {
      expect(tool.inputSchema).toMatchObject({ type: "object", additionalProperties: false });
      expect(tool.outputSchema).toBeDefined();
    }
  });

  it.each([
    ["wisp_status", { run: "r", agent: "a", state: "working" }, "status"],
    ["wisp_heartbeat", { run: "r", agent: "a" }, "heartbeat"],
    ["wisp_verdict", { run: "r", agent: "a", verdict: "PASS" }, "verdict"],
    ["wisp_question", { run: "r", agent: "a", question_id: "q", text: "?" }, "question"],
    ["wisp_check", { run: "r", agent: "a" }, "check"],
    ["wisp_ack", { run: "r", agent: "a", command_id: "c" }, "ack"],
  ] as const)("delegates %s to shared runtime", async (name, args, method) => {
    const ops = runtime();
    const result = await callWispTool(name, args, resolved, () => ops);
    expect(resolved.resolve).toHaveBeenCalled();
    expect(ops[method]).toHaveBeenCalledTimes(1);
    expect(result.isError).toBe(false);
    expect(result.content[0]!.type).toBe("text");
    expect(JSON.parse((result.content[0] as { type: "text"; text: string }).text)).toEqual(result.structuredContent);
  });

  it("maps stable expected errors and unexpected errors to identical envelopes", async () => {
    const expected = runtime();
    expected.check.mockRejectedValue(new WispError("bus_unreadable", "No bus", { path: "/x", reason: "read_failed" }));
    const result = await callWispTool("wisp_check", { run: "r", agent: "a" }, resolved, () => expected);
    expect(result).toMatchObject({
      isError: true,
      structuredContent: { ok: false, error: { code: "bus_unreadable", details: { path: "/x", reason: "read_failed" } } },
    });
    expect(result.content[0]!.type).toBe("text");
    expect(JSON.parse((result.content[0] as { type: "text"; text: string }).text)).toEqual(result.structuredContent);

    const unexpected = runtime();
    unexpected.check.mockRejectedValue(new Error("secret"));
    const contained = await callWispTool("wisp_check", { run: "r", agent: "a" }, resolved, () => unexpected, vi.fn());
    expect(contained).toMatchObject({
      isError: true,
      structuredContent: { ok: false, error: { code: "internal_error", details: { incident_id: expect.any(String) } } },
    });
  });

  it("SPEC-0001 R14 validates named-tool input before project resolution", async () => {
    const neverResolve = { resolve: vi.fn().mockRejectedValue(new Error("must not run")) };
    const result = await callWispTool(
      "wisp_check",
      { run: null, agent: "a" },
      neverResolve,
      () => runtime(),
    );
    expect(result).toMatchObject({
      isError: true,
      structuredContent: {
        ok: false,
        error: {
          code: "invalid_input",
          details: { field: "/run", reason: "null_not_allowed" },
        },
      },
    });
    expect(neverResolve.resolve).not.toHaveBeenCalled();
  });

  it("accepts via-only addressing before delegating to the runtime", async () => {
    const ops = runtime();
    const result = await callWispTool(
      "wisp_status",
      { run: "r", agent: "a", state: "working", via: "dispatcher" },
      resolved,
      () => ops,
    );
    expect(result.isError).toBe(false);
    expect(ops.status).toHaveBeenCalledWith({
      run: "r",
      agent: "a",
      state: "working",
      via: "dispatcher",
    });
  });

  it("SPEC-0001 error schemas expose only contract-valid bus reasons", () => {
    const definitions = createToolDefinitions();
    const output = definitions[0]!.outputSchema as unknown as {
      oneOf: Array<{ properties: { error?: { oneOf?: Array<{ properties: { code: { const: string }; details: { properties: { reason: { enum: string[] } } } } }> } } }>;
    };
    const errors = output.oneOf[1]!.properties.error!.oneOf!;
    const readable = errors.find((entry) => entry.properties.code.const === "bus_unreadable")!;
    const writable = errors.find((entry) => entry.properties.code.const === "bus_unwritable")!;
    expect(readable.properties.details.properties.reason.enum).not.toEqual(
      expect.arrayContaining(["mkdir_failed", "append_failed"]),
    );
    expect(writable.properties.details.properties.reason.enum).not.toEqual(
      expect.arrayContaining(["read_failed", "invalid_utf8"]),
    );
  });
});
