---
name: okf-consolidate
description: Use when the user types /okf-consolidate or wants to review, update, merge, prune, or stale-check an existing okf-memory bundle.
---

<!-- markdownlint-disable MD013 -->

# okf-consolidate

Update, merge, and prune an existing okf-memory bundle.

## Preconditions

1. `memory/index.md` must exist. If it does not, stop and suggest `/okf-init`.
2. The shared server must exist at `../okf-init/server.mjs` relative to this skill directory. If not, stop with: `Install all okf-memory skills together; okf-consolidate uses okf-init/server.mjs for review.`
3. Do not write `memory/` while the browser review is open.

## Load existing bundle

Read every concept markdown file under `memory/<area>/`, excluding reserved files named `index.md` and `log.md`. Parse frontmatter fields: `type`, `title`, `description`, `tags`, `files`, plus decision metadata.

## Staleness scan

Collect staleness anchors from:

- frontmatter `files:`
- inline repo-looking paths in memory bodies

Compare them with `git ls-files`. Mark stale memories with `stale: true` and clear `staleReasons` such as `Referenced file src/old.ts no longer exists`.

## Draft review payload

Use `mode: "consolidate"`.

- Propose `action: "update"` for memories that are stale or clearly outdated.
- Propose `action: "delete"` for memories that no longer apply and should be removed.
- Include all other memories as `action: "keep"` with `existingBody` so the user can still delete them.
- Include `existingBody` for every `update`, `delete`, and `keep` card.

Invoke the shared review server with `apply: true` so an approval is applied
by the deterministic writer (`../okf-init/write.mjs`) before the result
reaches you — never hand-author memory files, indexes, or the log:

```bash
node ../okf-init/server.mjs <<'OKF_PAYLOAD'
{ "mode": "consolidate", "apply": true, "project": "<git root>", "bundlePath": "memory/", "round": 1, "areas": [], "memories": [] }
OKF_PAYLOAD
```

Do **not** include `headCommit` — consolidation never moves
`last_memorized_commit`.

## React

- `review-feedback`: revise commented drafts plus the general note, increment `round`, and invoke the server again. Write nothing mid-loop.
- `cancel` / `timeout`: write nothing and explicitly report that consolidation was cancelled/timed out.
- `review-approved`: the verdicts are **already applied** — the result line
  carries `applied` with the writer's outcome (`written`, `deleted`, `kept`,
  `rejected`, `validation`). Verdict semantics, for reference: `accept` writes
  the proposed concept, `reject` discards the proposal, `keep` leaves the
  existing concept, `delete` removes it. The writer also regenerated the
  affected area indexes and `memory/index.md` links (preserving all foreign
  content), appended newest-first `memory/log.md` entries, and ran the
  bundle validator.

## Finish

Read `applied` from the result. If `applied.ok` is false (or
`applied.validation.ok` is false), show the error and fix it through another
review round — do not patch files by hand. Otherwise report
kept/updated/deleted/rejected counts and any stale memories that remain.
