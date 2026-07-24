// SPEC-0001 v7 S35/S40/S41/S43; issue #37 — capability-safe dashboard failure diagnostics.
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import { dashboardFailureDiagnostic } from "./dashboard-diagnostic.ts";

describe("SPEC-0001 v7 capability-safe dashboard failure diagnostics", () => {
  it("reports only an allowlisted code and classification", () => {
    const capability = "A".repeat(43);
    const result = {
      isError: true,
      structuredContent: {
        ok: false,
        error: {
          code: "dashboard_unavailable",
          message: `must not report Bearer ${capability}`,
          details: {
            reason: "owner_unhealthy",
            url: `http://127.0.0.1:49152/#capability=${capability}`,
          },
        },
      },
      content: [{
        type: "text",
        text: `Bearer ${capability} #capability=${capability}`,
      }],
    } as unknown as CallToolResult;

    const diagnostic = dashboardFailureDiagnostic(result);

    expect(diagnostic).toBe(
      "dashboardResult failed: code=dashboard_unavailable classification=owner_unhealthy",
    );
    expect(diagnostic).not.toContain(capability);
    expect(diagnostic).not.toContain("Bearer");
    expect(diagnostic).not.toContain("#capability=");
  });

  it("does not echo unrecognized error fields", () => {
    const capability = "B".repeat(43);
    const result = {
      isError: true,
      structuredContent: {
        ok: false,
        error: {
          code: capability,
          details: { reason: `Bearer ${capability}` },
        },
      },
      content: [],
    } as unknown as CallToolResult;

    expect(dashboardFailureDiagnostic(result)).toBe(
      "dashboardResult failed: code=unclassified classification=unclassified",
    );
  });
});
