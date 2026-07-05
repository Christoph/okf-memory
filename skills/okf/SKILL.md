---
name: okf
description: Use when the user types /okf or wants the project memory plane dashboard for memory, plans, chunks, and agent actions.
---

<!-- markdownlint-disable MD013 -->

# okf

Open the okf-memory project memory plane. This is a browser dashboard for memory state, OKF plan files, separate OKF chunk files, and action callbacks to the coding agent.

## Preconditions

1. The dashboard server must exist at `./server.mjs` relative to this skill directory. If not, stop with: `Install the full okf-memory skill folder; /okf needs okf/server.mjs for the dashboard.`
2. Do not mutate `memory/` while the browser dashboard is open. The dashboard only returns an action request; the agent performs file/code changes after the server exits.

## Load memory state

Detect whether `memory/index.md` exists.

If it exists:

- Read `memory/index.md` frontmatter for `okf_version` and `last_memorized_commit`.
- Count concept files under `memory/`, excluding reserved `index.md` and `log.md`.
- Count memories with stale anchors when cheap to do so: collect frontmatter `files:` and compare to `git ls-files`.
- Count unmemorized commits with `git log --oneline <last_memorized_commit>..HEAD` when `last_memorized_commit` is present and valid.
- Count concepts per area for `architecture`, `decisions`, `patterns`, `pitfalls`, and `setup`.

If it does not exist, set `memory.initialized: false`, counts to zero or `?`, and still show the standard areas.

## Load OKF plans and chunks

Plans and chunks are normal OKF concepts so they stay clear and human-readable.

Recommended structure:

```text
memory/plans/index.md
memory/plans/<plan-slug>.md
memory/plans/<plan-slug>/index.md
memory/plans/<plan-slug>/<chunk-slug>.md
```

A plan file should use frontmatter like:

```yaml
---
type: Plan
title: Dashboard UI for okf-memory
description: Add a browser project memory plane.
status: in-progress
tags:
  - planning
timestamp: 2026-07-05T00:00:00.000Z
files:
  - skills/okf/server.mjs
---
```

Each chunk must be its own OKF concept file:

```yaml
---
type: Work Chunk
title: Add dashboard server
description: Render memory state, plans, chunks, and action buttons.
status: pending
depends_on:
  - plans/dashboard-ui/design-schema
files:
  - skills/okf/server.mjs
---
```

Load every non-reserved `.md` file under `memory/plans/`:

- `type: Plan` files become `plans[]`.
- `type: Work Chunk` or `type: Chunk` files become `chunks[]`.
- Derive `id` from path minus `.md`, for example `plans/dashboard-ui/render-dashboard`.
- Derive a chunk's `planId` from frontmatter `plan:` if present, otherwise from its parent plan path.
- Read `title`, `description`, `status`, `depends_on`, `files`, and body.

If there are no plan files yet, pass empty arrays; the dashboard can still request `create-plan`.

## Invoke dashboard

Send a JSON payload to the local dashboard server:

```bash
node ./server.mjs <<'OKF_PAYLOAD'
{ "project": "...", "bundlePath": "memory/", "memory": {}, "areas": [], "plans": [], "chunks": [] }
OKF_PAYLOAD
```

Read exactly one JSON line from stdout.

## React to dashboard actions

The server returns `{ "type": "dashboard-action", "action": "...", "target": "...", "prompt": "..." }`.

- `init`: run the `/okf-init` workflow.
- `consolidate`: run the `/okf-consolidate` workflow.
- `memorize`: run the `/okf-memorize` workflow.
- `create-plan`: draft new OKF plan and chunk files, then review the proposed files with the user before writing.
- `create-chunk`: add a separate `Work Chunk` OKF concept under the target plan, then review before writing.
- `implement`: read the selected chunk file and its dependencies, implement it, run relevant tests, then update the chunk `status` only after success.
- `test`: read the selected chunk file, run relevant tests, report results, and update `status: tested` only when tests pass.
- `mark-done`: verify the selected chunk's requested tests have passed or ask the user for confirmation, then update `status: done`.
- `draft-memory`: research the target area (`architecture`, `decisions`, `patterns`, `pitfalls`, or `setup`), draft a memory card, and send it through the existing review flow before writing.
- `draft-memory-prompt`: use `prompt` as the user's requested memory topic, research the repo, draft the appropriate area memory, and send it through review before writing.
- `close`: report that no action was selected.

For `cancel` / `timeout`, write nothing and explicitly report that the dashboard was cancelled/timed out.

## Writing plan/chunk files

When creating or updating plan/chunk concepts:

1. Preserve OKF frontmatter and human-readable markdown bodies.
2. Keep each chunk in a separate `.md` file.
3. Regenerate `memory/plans/index.md` and the affected plan directory `index.md`.
4. Regenerate root `memory/index.md` links if a new `plans/` area is introduced.
5. Append a newest-first `memory/log.md` entry with a bold lead such as `**Plan**`, `**Chunk**`, or `**Update**`.
6. Run the validator when available.
