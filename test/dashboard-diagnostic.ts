const DASHBOARD_ERROR_CODES = [
  "dashboard_unavailable",
  "dashboard_version_conflict",
  "internal_error",
] as const;
const DASHBOARD_CLASSIFICATIONS = [
  "runtime_unsafe",
  "project_contains_runtime",
  "process_identity_unavailable",
  "owner_identity_unverifiable",
  "bind_failed",
  "publish_failed",
  "owner_starting",
  "owner_unhealthy",
  "ownership_contended",
] as const;

type DashboardErrorCode = (typeof DASHBOARD_ERROR_CODES)[number] | "unclassified";
type DashboardClassification = (typeof DASHBOARD_CLASSIFICATIONS)[number] | "unclassified";

export interface DashboardFailureDiagnostic {
  code: DashboardErrorCode;
  classification: DashboardClassification;
}

export function extractDashboardFailureDiagnostic(
  result: unknown,
): DashboardFailureDiagnostic {
  const toolResult = record(result);
  const envelope = record(toolResult?.structuredContent);
  const error = record(envelope?.error);
  const details = record(error?.details);
  return {
    code: member(error?.code, DASHBOARD_ERROR_CODES),
    classification: member(details?.reason, DASHBOARD_CLASSIFICATIONS),
  };
}

export function dashboardFailureDiagnostic(
  result: unknown,
): string {
  const diagnostic = extractDashboardFailureDiagnostic(result);
  return `dashboardResult failed: code=${diagnostic.code} classification=${diagnostic.classification}`;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function member<const Values extends readonly string[]>(
  value: unknown,
  values: Values,
): Values[number] | "unclassified" {
  return typeof value === "string" && (values as readonly string[]).includes(value)
    ? value as Values[number]
    : "unclassified";
}
