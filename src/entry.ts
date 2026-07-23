import { startStdioServer } from "./mcp.ts";

startStdioServer().catch((error: unknown) => {
  process.stderr.write(`wisp failed to start: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
