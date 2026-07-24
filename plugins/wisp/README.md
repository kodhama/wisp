# Wisp

Wisp is a project-scoped observability bus for collaborating agents. This
plugin includes one self-contained stdio MCP server and a portable lifecycle
skill for both Claude Code and Codex.

Install the Wisp entry from the Kodhama Stewards marketplace. No separate Wisp
runtime, project dependency, or daemon is required.

The MCP server exposes six tools: `wisp_status`, `wisp_heartbeat`,
`wisp_verdict`, `wisp_question`, `wisp_check`, and `wisp_ack`.

Claude binds the server to the active project through its plugin environment.
Codex starts from its host-selected session directory and binds that directory
before importing the installed bundle. Both paths require no project setup,
and an invalid host binding fails closed instead of guessing.
