# Wisp

Wisp is a project-scoped observability bus for collaborating agents. This
plugin includes one self-contained stdio MCP server, a portable lifecycle
skill, and an explicitly started project dashboard for both Claude Code and
Codex.

Install the Wisp entry from the Kodhama Stewards marketplace. No separate Wisp
runtime, project dependency, or daemon is required.

The MCP server exposes seven tools: `wisp_status`, `wisp_heartbeat`,
`wisp_verdict`, `wisp_question`, `wisp_check`, and `wisp_ack`.
`wisp_dashboard` starts or reuses one authenticated loopback dashboard for the
current project and returns its capability-bearing link. Nothing listens
until that tool is called, and the owning MCP session cleans the listener up.

Claude binds the server to the active project through its plugin environment.
Codex starts from its host-selected session directory and binds that directory
before importing the installed bundle. Both paths require no project setup,
and an invalid host binding fails closed instead of guessing.
