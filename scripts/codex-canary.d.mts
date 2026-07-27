export interface CommandResult {
  status: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  outputExceeded: boolean;
  callbackFailed: boolean;
  spawnError: Error | undefined;
  stdout: Buffer;
  stderr: Buffer;
}

export interface NormalizedTranscript {
  wisp_call_seen: boolean;
  incomplete_wisp_call: boolean;
  completed_tools: string[];
  check_passed: boolean;
  write_passed: boolean;
  dashboard_call_passed: boolean;
  dashboard_url: string | undefined;
  transcript_verified: boolean;
}

export function runCommand(
  command: string,
  args: string[],
  options?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    killGraceMs?: number;
    maxOutputBytes?: number;
    onStdoutLine?: (
      line: string,
      state: { childIsLive(): boolean; signal: AbortSignal },
    ) => void | Promise<void>;
  },
): Promise<CommandResult>;

export function createOutputCollector(
  limit: number,
  onOverflow?: () => void,
): {
  accept(stream: "stdout" | "stderr", chunk: Uint8Array): boolean;
  result(): {
    acceptedBytes: number;
    outputExceeded: boolean;
    stdout: Buffer;
    stderr: Buffer;
  };
};

export function normalizeTranscript(
  values: unknown[],
  options: {
    nonce: string;
    execStatus: number | null;
    execTimedOut?: boolean;
    everyLineParsed: boolean;
  },
): NormalizedTranscript;

export function classifyCanary(options: {
  mode: "weekly" | "manual";
  normalized: NormalizedTranscript;
  busPathVerified: boolean;
  dashboardHealthPassed: boolean;
  provenPreToolAbsence: boolean;
  outputExceeded?: boolean;
  callbackFailed?: boolean;
}): "pass" | "fail" | "inconclusive";

export function dashboardHealth(
  urlText: string,
  parentSignal?: AbortSignal,
  fetchImpl?: typeof fetch,
): Promise<boolean>;

export function buildCodexExecArgs(fixture: string, prompt: string): string[];

export function execProvesPreToolAbsence(
  result: Pick<CommandResult, "status" | "spawnError" | "stderr"> &
    Partial<Pick<CommandResult, "timedOut">>,
): boolean;

export function workflowContext(env?: NodeJS.ProcessEnv): {
  workflow_id: number;
  workflow_run_url: string;
  git_sha: string;
};

export function validateCanaryEvidence(value: unknown): Record<string, unknown>;

export function installOutcomeFailed(value: string | undefined): boolean;

export function validCanonicalStatus(line: string, nonce: string): boolean;

export function commandEnvironments(source?: NodeJS.ProcessEnv): {
  baseEnv: NodeJS.ProcessEnv;
  execEnv: NodeJS.ProcessEnv;
};
