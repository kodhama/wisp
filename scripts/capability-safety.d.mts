export const CAPABILITY_REDACTION_ERROR: string;
export const DEFAULT_OUTPUT_LIMIT_BYTES: number;

export function extractCapabilities(bytes: Buffer): string[];
export function sanitizeCapabilityBytes(
  bytes: Buffer,
  observedCapabilities?: string[],
): Buffer;
export function assertCapabilityAbsent(
  bytes: Buffer,
  observedCapabilities?: string[],
): void;
export function writeSafeCanaryArtifacts(options: {
  outputDirectory: string;
  rawTranscript: Buffer;
  evidence: Record<string, unknown>;
  observedCapabilities?: string[];
  readyOutputPath?: string;
  injectFailure?: "transform" | "scan";
}): Promise<void>;
export function writeBrowserEvidence(
  path: string,
  evidence: Record<string, unknown>,
  observedCapabilities: string[],
  hooks?: {
    onFreeze?(evidence: Readonly<Record<string, unknown>>): void;
    onValidate?(evidence: Readonly<Record<string, unknown>>): void;
    onSerialize?(bytes: Buffer): void;
    onScan?(bytes: Buffer): void;
    onDiscard?(): void;
  },
): Promise<void>;
export function prepareBrowserEvidence(
  evidence: Record<string, unknown>,
  observedCapabilities: string[],
  hooks?: {
    onFreeze?(evidence: Readonly<Record<string, unknown>>): void;
    onValidate?(evidence: Readonly<Record<string, unknown>>): void;
    onSerialize?(bytes: Buffer): void;
    onScan?(bytes: Buffer): void;
    onDiscard?(): void;
  },
): Readonly<{
  evidence: Readonly<Record<string, unknown>>;
  bytes: Buffer;
}>;
export function persistPreparedBrowserEvidence(
  path: string,
  bytes: Buffer,
): Promise<void>;
export function validateBrowserEvidence(
  evidence: Record<string, unknown>,
): Record<string, unknown>;
export function runSanitizedCommand(
  command: string,
  args: string[],
  options?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    maxOutputBytes?: number;
    timeoutMs?: number;
    killGraceMs?: number;
    emit?: boolean;
    controlNonce?: string;
    redactStandaloneCapabilities?: boolean;
  },
): Promise<{
  status: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  safetyFailed: boolean;
  spawnError: boolean;
  controlStages?: string[];
  controlFailures?: string[];
  stdout?: Buffer;
  stderr?: Buffer;
}>;
export function directoryIsAbsentOrEmpty(path: string): Promise<boolean>;
