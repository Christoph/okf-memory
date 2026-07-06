---
type: Architecture
title: Browser server contract
description: Interactive workflows run a short-lived local server that receives a JSON payload on stdin and returns exactly one JSON result on stdout.
tags:
  - browser-ui
  - server
  - workflow
timestamp: 2026-07-06T00:00:00.000Z
files:
  - lib/server.mjs
  - lib/ui.mjs
  - skills/okf-init/server.mjs
  - skills/okf/server.mjs
  - docs/EXTENSION.md
---

# Contract

The skill invokes a local `server.mjs` with a heredoc JSON payload. The server renders a browser page, waits for the user's action, then prints exactly one JSON line to stdout (`review-approved`, `review-feedback`, `dashboard-action`, `cancel`, or `timeout`). The agent must not mutate `memory/` while that server is open.

`lib/server.mjs` owns the common lifecycle: remote-session detection, port binding, takeover of stale servers, signal-to-cancel handling, `/submit`, `/cancel`, and the two-hour timeout. `lib/ui.mjs` owns the shared page shell and client helpers.

Review flows reuse `skills/okf-init/server.mjs`; the dashboard has its own `skills/okf/server.mjs`. Keep stdout machine-readable: diagnostics belong on stderr.
