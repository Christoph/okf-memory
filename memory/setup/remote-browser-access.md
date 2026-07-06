---
type: Setup
title: Remote browser access
description: Container, sbx, SSH, and devcontainer runs need host-facing port forwarding for browser UIs.
tags:
  - browser-ui
  - remote
  - docker
  - sbx
timestamp: 2026-07-06T00:00:00.000Z
files:
  - README.md
  - docs/EXTENSION.md
  - lib/server.mjs
  - test/server.test.mjs
---

## Remote browser access

Browser-backed skills run the HTTP server inside the current environment, but
in Docker/sbx/devcontainer/SSH sessions the browser is on the host.
`lib/server.mjs` handles the server side by treating remote sessions specially:
`OKF_REMOTE=1` (or SSH/container detection) binds `0.0.0.0`, skips
`open`/`xdg-open`, and prints a host-clickable `http://127.0.0.1:<port>/`
URL. Use `OKF_REMOTE=0` only when forcing local loopback behavior.

The environment still has to publish the fixed OKF port. For Docker sandboxes
(`sbx`), publish with the explicit host-to-container form while the sandbox is
running: `sbx ports <sandbox> --publish 8888:8888`. A bare `--publish 8888`
chooses a random host port, so the printed URL will not match; publishes also
do not survive sandbox stops, so reapply them after each start.
Devcontainers/Codespaces usually forward automatically; SSH users need
`ssh -L 8888:localhost:8888 host`.

When the host browser gets `ERR_CONNECTION_REFUSED`, check the host-side publish
first (`lsof -nP -iTCP:8888 -sTCP:LISTEN`, then `sbx ls` PORTS). Only after the
publish exists should you debug inside the sandbox, and remember these one-shot
servers are reachable only while a skill is waiting for a browser response.
