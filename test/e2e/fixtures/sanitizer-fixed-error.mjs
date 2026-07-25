import {
  runSanitizedCommand,
} from "../../../scripts/capability-safety.mjs";

const result = await runSanitizedCommand(
  process.execPath,
  ["-e", 'process.stdout.write("\\x1eWISP_CAPABILITY:malformed")'],
  { controlNonce: "valid-control-nonce" },
);
process.exitCode = result.safetyFailed ? 0 : 90;
