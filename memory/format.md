---
type: Reference
title: iterator memory format
description: Metadata schema for this iterator memory/ bundle (plan, chunks, indexes, log).
timestamp: 2026-07-02T00:00:00Z
---

# iterator memory format

This bundle is a conformant **OKF v0.1** knowledge bundle (a directory of
markdown files with YAML frontmatter — see `docs/OKF_SPEC.md` in the iterator
plugin). It is written and maintained by the `/iterator-*` skills and is
readable and hand-editable without any tooling. This document is copied
verbatim into every bundle so the bundle stays self-describing even when moved
out of its repository.

## Layout

```
memory/
├── index.md          # bundle root index; carries okf_version frontmatter (OKF §11)
├── format.md         # this file — type: Reference — the metadata schema
├── plan.md           # type: Plan — the plan concept
├── log.md            # OKF §7 update log; skills append entries
└── chunks/
    ├── index.md      # chunk listing with status, for progressive disclosure
    └── <slug>.md     # type: Chunk — one concept per chunk
```

Rules:

- The bundle lives in `memory/` at the git root (override with the
  `ITERATOR_MEMORY_DIR` env var; always resolved relative to the git root).
- Every non-reserved `.md` file has parseable YAML frontmatter with a non-empty
  `type` (OKF §9). `index.md` / `log.md` are reserved (OKF §6/§7).
- Cross-references between documents use **bundle-absolute** links beginning
  with `/`, e.g. `/chunks/auth-middleware.md` (OKF §5.1).
- Skills regenerate the `index.md` files after any change. Consumers must
  tolerate a stale index (OKF permissive-consumption model).

---

## Chunk documents — `chunks/<slug>.md`

The **slug** (the kebab-case filename without `.md`) is the chunk's identity:
it is the OKF concept ID (`chunks/<slug>`), the value used in `depends_on`, and
the name used in commit messages. Renaming a chunk means renaming the file and
rewriting every `depends_on` reference to it.

```markdown
---
type: Chunk                             # REQUIRED (OKF type)
title: Auth middleware                  # display name
description: JWT-based auth middleware for all protected routes.  # one line
status: pending                         # draft | pending | done
size: small                             # small (≤100 est. lines) | medium (≤200) | large (>200)
lines_estimate: 60                      # integer, estimated from the plan
depends_on: [config-module]             # chunk slugs; [] if none
files: ["src/auth.ts", "src/middleware/*.ts"]   # paths/globs this chunk owns
timestamp: 2026-07-02T10:00:00Z         # OKF "timestamp": last meaningful change
done: 2026-07-02                        # present only once implemented & committed
reviewed: 2026-07-02                    # present only after a review pass
tests: ["test/auth.test.mjs"]           # test files owned by this chunk (written by /iterator-test)
tests_status: red                       # none | red | green (absent means none)
commits:                                # commits recorded for this chunk (kind: test | implement)
  - sha: a1b2c3d
    kind: test
    date: 2026-07-02
tags: []                                # optional
---

# Implementation notes

How to build it: approach, constraints, gotchas. Written by /iterator-chunk,
consumed by /iterator-implement.

# Snippets

Illustrative code (interfaces, key functions, call sites) — never full
implementations.

```ts
export function requireAuth(req, res, next) { /* … */ }
```

# Depends on

* [Config module](/chunks/config-module.md) — needs the JWT secret from config.

# Blast radius

What breaks if this chunk is wrong; which other chunks/files feel it.

# Review

## 2026-07-02
* **Approved** — after 1 feedback round: renamed `verify()` to `verifyToken()`.
```

### Chunk field semantics

| Field | Required | Meaning / rules |
|---|---|---|
| `type` | yes | Always `Chunk`. OKF consumers route on this. |
| `title` | yes | Human display name. |
| `description` | yes | One sentence; copied into `chunks/index.md` entries. |
| `status` | yes | `draft`, `pending`, or `done`. `/iterator-chunk` writes proposals as `draft`; accepting the chunk set in the UI promotes every draft to `pending`. Drafts are never implementable/testable. Only `/iterator-implement` sets `done` (on Accept-and-commit). |
| `size` / `lines_estimate` | yes | Estimate the *expected diff* (changed lines) from `files` + the implementation notes, not gut feel. Target ~50–200 lines: below ~30 the flow overhead outweighs the chunk (merge it), above ~300 it cannot be reviewed (split it) — the writer warns outside that window. `large` chunks get a ⚠️ in the UIs. |
| `depends_on` | yes (may be `[]`) | Chunk slugs that must be `done` before this chunk is implemented. Must be acyclic and reference existing files. This is the **canonical** dependency data; the `# Depends on` body section mirrors it with optional "why" prose. |
| `files` | yes | Paths or simple globs the chunk owns. `/iterator-review` maps diff hunks to a chunk through these; first matching chunk wins. |
| `timestamp` | yes | ISO 8601 "last meaningful change" (OKF's field — iterator uses it instead of inventing `last_updated`). Every skill that edits the file updates it. |
| `done`, `reviewed` | when applicable | ISO dates. `reviewed` is set/refreshed by `/iterator-review`; review notes are appended to the `# Review` body section (newest first). |
| `tests` | no | Test file paths owned by this chunk. Written by `/iterator-test`; consumed by `/iterator-implement` as the implementation goal. |
| `tests_status` | no | `none` \| `red` \| `green` (absent = `none`). `red` = tests exist and fail — the *expected* state before implementation (red/green flow). `/iterator-test` sets `red` or `green`; `/iterator-implement` flips `red → green` on Accept-and-commit. Independent of `status`: an implemented-but-red chunk is `status: done`, `tests_status: red`. |
| `commits` | no | List of `{ sha, kind, date }`, `kind: test \| implement`. Recorded shas are an **optimization** — they go stale when the branch is rebased or amended. The resilient lookup is the `Chunk: <slug>` commit trailer: consumers must fall back to `git log --grep '^Chunk: <slug>'`. A commit cannot contain its own sha, so each sha is recorded in the *next* bundle write after committing. |

Body sections `# Implementation notes`, `# Snippets`, `# Depends on`,
`# Blast radius` are written at chunk-creation time; `# Review` is appended by
review passes. All are optional except `# Implementation notes`.

---

## Plan document — `plan.md`

```markdown
---
type: Plan
title: Add JWT authentication
description: JWT-based auth for all protected API routes.
status: draft                           # draft | approved
branch: feature/auth
created: 2026-07-02
timestamp: 2026-07-02T10:00:00Z
---

# Goal
…

# Architecture
…

# Dependencies
* `jsonwebtoken` — token signing/verification

# Key decisions
…

# Product fit
…

# Chunks

* [Config module](/chunks/config-module.md) - Centralize env/config access
* [Auth middleware](/chunks/auth-middleware.md) - JWT middleware for protected routes
```

`status: approved` is set when the user accepts the plan in the UI. The
`# Chunks` section is (re)generated by `/iterator-chunk` and links every chunk
so OKF graph consumers see plan → chunk edges.

---

## Index files

`memory/index.md` — the bundle root; the only index permitted frontmatter
(OKF §11), carrying `okf_version`:

```markdown
---
okf_version: "0.1"
---

# iterator memory

* [Plan](plan.md) - JWT-based auth for all protected API routes.
* [Format](format.md) - Metadata schema for this bundle.
* [Chunks](chunks/) - One document per implementation chunk.
* [Log](log.md) - Chronological history of plan/chunk/implement/review events.
```

`memory/chunks/index.md` — no frontmatter; status is folded into the
description text (which OKF permits). Ordering is dependency order
(topological, ties broken by creation order):

```markdown
# Chunks

* [Config module](config-module.md) - ✅ done · 🟢 tests green · small · Centralize env/config access
* [Auth middleware](auth-middleware.md) - ⬜ pending · 🔴 tests red · small · depends: config-module · JWT middleware
* [API routes](api-routes.md) - ⬜ pending · medium · depends: auth-middleware · REST routes
```

The test badge (`🔴 tests red` / `🟢 tests green`) sits between the status and
the size and is **omitted** when `tests_status` is `none`/absent (see
`api-routes` above). Unaccepted chunk proposals show `📝 draft` in place of
`⬜ pending`.

Every skill that changes chunk status or metadata regenerates
`chunks/index.md`. Skills stay context-efficient by reading `chunks/index.md`
first, then opening only the chunk file(s) they need.

---

## Log — `log.md`

OKF §7 format, newest first. Each skill appends one entry per meaningful event
(plan approval, chunk creation, implementation commit, review, tests):

```markdown
# iterator update log

## 2026-07-02
* **Review**: Approved [Auth middleware](/chunks/auth-middleware.md) after 1 feedback round.
* **Implementation**: Committed chunk(auth-middleware) on branch feature/auth.
* **Creation**: Plan approved; created 3 chunks.
```

This is the cross-session audit trail — "what did the AI do while I was gone".

---

## Full example chunk

```markdown
---
type: Chunk
title: Config module
description: Centralize environment/config access behind a typed accessor.
status: done
size: small
lines_estimate: 30
depends_on: []
files: ["src/config.ts"]
timestamp: 2026-07-02T09:40:00Z
done: 2026-07-02
reviewed: 2026-07-02
tests: ["test/config.test.ts"]
tests_status: green
commits:
  - sha: 9f8e7d6
    kind: test
    date: 2026-07-02
  - sha: 5c4b3a2
    kind: implement
    date: 2026-07-02
tags: [foundation]
---

# Implementation notes

Read and validate every required env var once at startup; export a frozen
`config` object. Throw a clear error listing all missing vars rather than
failing lazily at first use.

# Snippets

```ts
export interface Config { jwtSecret: string; port: number; }
export const config: Config = loadConfig();
```

# Blast radius

Every module that reads `process.env` directly should route through here; a
wrong default (e.g. an empty `jwtSecret`) silently weakens auth downstream.

# Review

## 2026-07-02
* **Approved** — no changes requested.
```
