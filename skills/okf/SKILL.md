---
name: okf
description: Use when the user types /okf or wants the project memory plane dashboard for memory, plans, chunks, and agent actions.
---

<!-- markdownlint-disable MD013 -->

# okf

Open the okf-memory project memory plane. This is a browser dashboard for memory state, OKF plan files, separate OKF chunk files, and action callbacks to the coding agent.

## Preconditions

1. The dashboard server and gatherer must exist at `./server.mjs` and `./gather.mjs` relative to this skill directory. If not, stop with: `Install the full okf-memory skill folder; /okf needs okf/server.mjs and okf/gather.mjs for the dashboard.`
2. Do not mutate `memory/` while the browser dashboard is open. The dashboard only returns an action request; the agent performs file/code changes after the server exits.

## Open the dashboard

Gathering state is mechanical and fully scripted — do **not** read bundle files or run git yourself to assemble the payload. From anywhere inside the project:

```bash
node <skill-dir>/gather.mjs | node <skill-dir>/server.mjs
```

`gather.mjs` resolves the project root (`git rev-parse --show-toplevel` from the cwd; pass an explicit root as its first argument only when the cwd is outside the target repo) and prints the full payload: memory state (`okf_version`, `last_memorized_commit`, concept count, stale file anchors, unmemorized commit count), the five knowledge areas with counts, and every plan/chunk concept under `memory/plans/`. A missing bundle yields `memory.initialized: false` with the standard areas.

Read exactly one JSON line from the server's stdout and react to it (see below).

## Plan and chunk file format

Plans and chunks are normal OKF concepts so they stay clear and human-readable. `gather.mjs` reads them; you write them when handling `create-plan` / `create-chunk` actions. Treat an existing `memory/index.md` as state to extend, not a generated file to replace: preserve its frontmatter (`okf_version`, `last_memorized_commit`, and unknown keys) and all existing area links.

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

(`gather.mjs` maps these automatically: `type: Plan` files become `plans[]`; `type: Work Chunk` / `type: Chunk` files become `chunks[]`; a concept's `id` is its path minus `.md`; a chunk's `planId` comes from frontmatter `plan:` or its parent plan path. No plan files yet is fine — the dashboard still offers `create-plan`.)

## React to dashboard actions

The server returns `{ "type": "dashboard-action", "action": "...", "target": "...", "prompt": "..." }`.

- `init`: run the `/okf-init` workflow.
- `consolidate`: run the `/okf-consolidate` workflow.
- `memorize`: run the `/okf-memorize` workflow.
- `create-plan`: draft a new OKF plan, review the exact proposed markdown with the user, then on approval write `memory/plans/<plan-slug>.md`, `memory/plans/<plan-slug>/index.md`, regenerate `memory/plans/index.md`, merge the `/plans/` root link if needed, and append `memory/log.md`.
- `create-chunk`: add a separate `Work Chunk` OKF concept under the target plan, then review the exact proposed markdown before writing.
- `implement`: read the selected chunk file and its dependencies, implement it, run relevant tests, then update the chunk `status` only after success.
- `test`: read the selected chunk file, run relevant tests, report results, and update `status: tested` only when tests pass.
- `mark-done`: verify the selected chunk's requested tests have passed or ask the user for confirmation, then update `status: done`.
- `draft-memory`: research the target area (`architecture`, `decisions`, `patterns`, `pitfalls`, or `setup`), draft a memory card, and send it through the existing review flow before writing.
- `draft-memory-prompt`: use `prompt` as the user's requested memory topic, research the repo, draft the appropriate area memory, and send it through review before writing.
- `close`: report that no action was selected.

For `cancel` / `timeout`, write nothing and explicitly report that the dashboard was cancelled/timed out.

## Writing plan/chunk files

When creating or updating plan/chunk concepts:

For `create-plan`, write the approved plan as `memory/plans/<plan-slug>.md` with `type: Plan`, `status`, `branch`, `created`, `timestamp`, and any relevant `files:` anchors. Also create `memory/plans/<plan-slug>/index.md` for that plan's chunks and update `memory/plans/index.md` with the plan title and one-line description.

1. Preserve OKF frontmatter, unknown metadata keys, and human-readable markdown bodies.
2. Keep each chunk in a separate `.md` file.
3. Regenerate `memory/plans/index.md` and the affected plan directory `index.md`.
4. Merge the `Plans` area link into root `memory/index.md` only if it is missing; never overwrite existing root frontmatter, `last_memorized_commit`, or memory area links.
5. Append a newest-first `memory/log.md` entry with a bold lead such as `**Plan**`, `**Chunk**`, or `**Update**`.
6. Run the validator when available.
