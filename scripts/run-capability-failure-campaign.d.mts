export function failureCasePassed(
  stage: string,
  failure: string,
  result: {
    status: number | null;
    signal: NodeJS.Signals | null;
    safetyFailed: boolean;
    controlStages?: string[];
    controlFailures?: string[];
  },
  outputEmpty: boolean,
): boolean;

export function runCapabilityFailureCampaign(
  artifactGuard: string,
): Promise<boolean>;
