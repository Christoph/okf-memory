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

Send a JSON payload to the shared review server with `mode: "init"`, all memories marked `action: "create"`, and `apply: true` so an approval is applied by the sibling deterministic writer (`write.mjs`) before the result reaches you — never hand-author memory files, indexes, or the log. Set `headCommit` to `git rev-parse HEAD` so the writer seeds `last_memorized_commit`.

Claude Code plugin path:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/okf-init/server.mjs" <<'OKF_PAYLOAD'
{ "mode": "init", "apply": true, "project": "<git root>", "bundlePath": "memory/", "round": 1, "headCommit": "...", "areas": [], "memories": [] }
OKF_PAYLOAD
```

Portable skill path when running from this skill directory:

```bash
node ./server.mjs <<'OKF_PAYLOAD'
{ "mode": "init", "apply": true, "project": "<git root>", "bundlePath": "memory/", "round": 1, "headCommit": "...", "areas": [], "memories": [] }
OKF_PAYLOAD
```

Read exactly one JSON line from stdout.

## React

- `review-feedback`: revise the commented drafts plus the general note, increment `round`, and invoke the server again. Write nothing mid-loop.
- `cancel` / `timeout`: write nothing and tell the user explicitly that initialization was cancelled/timed out.
- `review-approved`: the accepted concepts are **already written** — the result line carries `applied` with the writer's outcome (`written`, `rejected`, `advancedTo`, `validation`): concept files, regenerated area indexes, the root `memory/index.md` (with `okf_version` and `last_memorized_commit`), and newest-first `memory/log.md` entries all exist on disk, validated. If `applied.ok` or `applied.validation.ok` is false, show the error and fix it through another review round — do not patch files by hand.

## After approval: the extension contract

The only file you author by hand (its content is project-specific prose):
create `memory/EXTENSIONS.md` as the extension-facing memory contract and add
`* [Extension contract](EXTENSIONS.md) - How extensions should read and update this memory bundle.`
to the root index's links. It is
an ordinary OKF concept with frontmatter similar to:

```yaml
---
type: Reference
title: okf-memory extension contract
description: How agents and extensions should read and safely update this memory bundle.
tags:
  - extensions
  - memory-contract
timestamp: <ISO timestamp>
---
```

Its body must explain, in project-specific but concise terms:

- Start reads at `memory/index.md`, follow area indexes, then open only relevant
  concept files (progressive disclosure).
- A concept ID is the bundle-relative path without `.md`; chunk IDs/slugs are
  their filenames without `.md` and are the stable identity used by tools.
- Non-reserved concept files require YAML frontmatter with a non-empty `type`;
  preserve unknown keys and tolerate unknown concept types.
- Safe writes create or update one concept file at a time, keep markdown
  human-readable and diffable, update `timestamp`, regenerate affected indexes,
  and append a newest-first `memory/log.md` entry for meaningful changes.
- Validate with `node scripts/validate.mjs memory/` when this repository's
  validator is available; otherwise apply the OKF v0.1 conformance rules.

Link this contract from the root `memory/index.md` so other extensions can
self-discover it without package-specific knowledge.

## Card schema (what the writer emits from your drafts)

Draft cards carry `id` (`<area>/<slug>`), `type`, `title`, `description`, optional `tags`/`files`, and `body`; the writer turns each accepted card into `<area>/<slug>.md`:

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

Use type values `Architecture`, `Decision`, `Pattern`, `Pitfall`, or `Setup`. Decision memories also include `status: accepted` or `status: superseded` and `date:`. Use bundle-absolute cross-links such as `/patterns/error-handling.md` in bodies.

## Finish

Report created/accepted/rejected counts from `applied`, mention that `memory/EXTENSIONS.md` was created for other extensions, and remind the user to paste the README project-memory snippet into `CLAUDE.md` or `AGENTS.md`.
