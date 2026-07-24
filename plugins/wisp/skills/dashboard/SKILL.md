---
name: dashboard
description: Open or show the Wisp dashboard for the current project. Use when the user asks to open, show, start, or get a link to the Wisp dashboard.
---

# Open the Wisp dashboard

Call `wisp_dashboard` with the exact empty input `{}`.

Present the returned URL as a clickable link. State whether the dashboard was
started or an existing instance was reused.

Do not invent or alter the URL. Do not run a shell command, start the legacy
server, open a browser, or accept a project path. If the tool fails, report its
stable error and retry guidance without attempting another startup mechanism.
