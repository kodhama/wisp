# Wisp

Wisp is a **Preview** project-scoped observability bus for collaborating agents. This
plugin includes one self-contained stdio MCP server, a portable lifecycle
skill, and an explicitly started project dashboard for both Claude Code and
Codex.

`VERSION` is the package's independent SemVer authority. Both host manifests,
the installed Codex cache path, root package metadata, runtime identity, and
generated bundle carry that same value.

Support is not claimed. Marketplace presence does not create a Supported
claim; neither do successful installation, ordinary CI, deterministic
end-to-end tests, or live smoke. No separate Wisp runtime, project dependency,
or daemon is required by the plugin.

The MCP server exposes seven tools: `wisp_status`, `wisp_heartbeat`,
`wisp_verdict`, `wisp_question`, `wisp_check`, `wisp_ack`, and
`wisp_dashboard`.
`wisp_dashboard` starts or reuses one authenticated loopback dashboard for the
current project and returns its capability-bearing link. Nothing listens
until that tool is called, and the owning MCP session cleans the listener up.

Claude binds the server to the active project through its plugin environment.
Codex starts from its host-selected session directory and binds that directory
before importing the installed bundle. Both paths require no project setup,
and an invalid host binding fails closed instead of guessing.

Any future Supported claim requires a new Wisp-local decision naming the
exact host and surface promise, limitations, evidence, and renewal policy.
