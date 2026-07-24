export interface CommandResult {
  status: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
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
    onStdoutLine?: (
      line: string,
      state: { childIsLive(): boolean; signal: AbortSignal },
    ) => void | Promise<void>;
  },
): Promise<CommandResult>;

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
  mode: "weekly" | "candidate";
  normalized: NormalizedTranscript;
  busPathVerified: boolean;
  dashboardHealthPassed: boolean;
  provenPreToolAbsence: boolean;
}): "pass" | "fail" | "inconclusive";

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

export function installOutcomeFailed(value: string | undefined): boolean;

export function validCanonicalStatus(line: string, nonce: string): boolean;
