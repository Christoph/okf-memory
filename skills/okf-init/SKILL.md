---
name: okf-init
description: Use when the user types /okf-init or wants to initialize an okf-memory OKF bundle for a project with browser review before writing memory/.
---

<!-- markdownlint-disable MD013 -->

# okf-init

Initialize an okf-memory bundle for the current project.

## Preconditions

1. If `memory/index.md` already exists, stop and tell the user to run `/okf-consolidate` instead.
2. Confirm the working tree context with `git rev-parse --show-toplevel` and `git rev-parse HEAD` when available.
3. Do not write `memory/` while the browser review is open.

## Analyze

Study enough of the repo to draft useful, non-obvious memories:

- `git ls-files`
- README and docs
- package/manifests/lockfiles
- entry points and CLI/server startup code
- CI and test setup
- representative source files for conventions

Use these areas:

- `architecture/` — how the system is structured
- `decisions/` — why important choices were made
- `patterns/` — how code here is written
- `pitfalls/` — known bugs and sharp edges
- `setup/` — build/test/run commands and key dependencies

Draft about 3–8 memories total per useful area. Every memory must tell an agent something it needs to act correctly in this codebase.

## Review

Send a JSON payload to the shared review server with `mode: "init"` and all memories marked `action: "create"`.

Claude Code plugin path:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/okf-init/server.mjs" <<'OKF_PAYLOAD'
{ "mode": "init", "project": "...", "bundlePath": "memory/", "round": 1, "areas": [], "memories": [] }
OKF_PAYLOAD
```

Portable skill path when running from this skill directory:

```bash
node ./server.mjs <<'OKF_PAYLOAD'
{ "mode": "init", "project": "...", "bundlePath": "memory/", "round": 1, "areas": [], "memories": [] }
OKF_PAYLOAD
```

Read exactly one JSON line from stdout.

## React

- `review-feedback`: revise the commented drafts plus the general note, increment `round`, and invoke the server again. Write nothing mid-loop.
- `cancel` / `timeout`: write nothing and tell the user explicitly that initialization was cancelled/timed out.
- `review-approved`: write accepted concepts and skip rejected ones.

## Write bundle on approval

Create:

```text
memory/
  index.md
  log.md
  architecture/index.md
  decisions/index.md
  patterns/index.md
  pitfalls/index.md
  setup/index.md
```

For every accepted concept, write `<area>/<slug>.md` with frontmatter:

```yaml
---
type: Pattern
title: Error handling
description: One sentence reused in indexes.
tags:
  - errors
timestamp: 2026-07-02T00:00:00.000Z
files:
  - src/lib/errors.ts
---
```

Use type values `Architecture`, `Decision`, `Pattern`, `Pitfall`, or `Setup`. Decision memories also include `status: accepted` or `status: superseded` and `date:`.

Root `memory/index.md` frontmatter:

```yaml
---
okf_version: "0.1"
last_memorized_commit: <git rev-parse HEAD>
---
```

Regenerate area indexes and root index with links. Use bundle-absolute cross-links such as `/patterns/error-handling.md`. Append a newest-first `memory/log.md` entry headed by today's ISO date with bold-lead `**Initialization**` bullets.

Run:

```bash
node scripts/validate.mjs memory/
```

Report created/accepted/rejected counts and remind the user to paste the README project-memory snippet into `CLAUDE.md` or `AGENTS.md`.
