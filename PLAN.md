# okf-memory — project-memory extension for coding agents

## Context

This repo (currently empty except `docs/`) becomes **okf-memory**: an extension for Claude Code, opencode, Codex CLI, and pi that maintains a per-project memory as an **OKF knowledge bundle** (`docs/OKF_SPEC.md`) in the target project's `memory/` directory. It captures architecture, decisions, patterns/conventions, bugs/pitfalls, and setup so a developer knows the codebase's dependencies and conventions, and a coding agent can **self-discover** exactly the knowledge it needs (e.g. "how do we do error handling in a web handler?") with minimal context cost via OKF progressive disclosure (`memory/index.md` → area index → concept doc, plus `grep -ril <keyword> memory/`).

Built as a Claude Code plugin following the local-server + browser-UI recipe in `docs/EXTENSION.md` (env prefix `OKF_`), with skill folders droppable into the other harnesses. Three commands:

- **`/okf-init`** — analyze the repo, draft memories per area, review in a browser UI, iterate via comments until accepted, write the bundle.
- **`/okf-consolidate`** — reopen the same review UI over the existing bundle to update/merge/delete; flags **stale** memories (referenced files no longer exist).
- **`/okf-memorize`** — draft memories from commits since `last_memorized_commit`; **conflicts** with existing memories are visually flagged; on accept: write files, append `log.md`, advance the commit marker.

## Scope decisions (user was AFK when asked — my recommendations, confirm at plan review)

- **Areas (5):** `architecture/`, `decisions/`, `patterns/`, `pitfalls/`, `setup/` (setup = build/test/run commands + key dependencies; the one essential the original 4 missed).
- **Review UI:** per-memory verdict (accept/reject or keep/delete) + per-memory comment + general comment. Comments send the review back to Claude for another round; no inline markdown editing in v1.
- **Extras in scope:** `scripts/validate.mjs` OKF conformance checker (run after every write), stale detection in consolidate, and the CLAUDE.md/AGENTS.md snippet telling agents to suggest `/okf-memorize` after significant changes.

## File tree

```
okf-memory/
├── .claude-plugin/
│   ├── plugin.json                  # name "okf-memory", version, description, author, license
│   └── marketplace.json
├── docs/                            # (exists) OKF_SPEC.md, EXTENSION.md
├── lib/
│   ├── server.mjs                   # EXTENSION.md §2.1 verbatim; <APP> → okf-memory, APP_ → OKF_
│   └── ui.mjs                       # reconstructed from §2.1 bullets: embed(), escHtml(), renderPage(),
│                                    #   BASE_CSS/DIFF_CSS, shared client JS (__TOKEN, __api, post,
│                                    #   cancel-beacon grace, mdToHtml with protocol allow-list)
├── scripts/
│   ├── sync.mjs                     # §2.3 verbatim; SERVER_SKILLS = ['okf-init']
│   └── validate.mjs                 # OKF conformance: parseable frontmatter, non-empty type,
│                                    #   reserved-name structure, forbidden index/log slugs; exit 1 + report
├── skills/
│   ├── okf-init/
│   │   ├── SKILL.md
│   │   ├── server.mjs               # THE shared review server; payload "mode": init|consolidate|memorize
│   │   └── lib/                     # synced copies (committed; drift-tested)
│   ├── okf-consolidate/SKILL.md     # no server — shells out to ../okf-init/server.mjs
│   └── okf-memorize/SKILL.md        # same
├── test/
│   ├── fixtures/{init,consolidate,memorize}.json   # memorize fixture includes a conflict + "</script>" string
│   ├── server.test.mjs              # the 5 mandatory §2.4 cases
│   ├── review.test.mjs              # mode-specific rendering + output round-trips
│   ├── sync.test.mjs                # byte-compare bundled lib/ vs root lib/
│   └── validate.test.mjs            # validator passes a good fixture bundle, fails broken ones
├── package.json                     # {"type":"module"}; scripts: test, sync, validate, preview:init/consolidate/memorize
└── README.md
```

## Review server contract (`skills/okf-init/server.mjs`)

**Input** (Claude → stdin via quoted heredoc, delimiter `OKF_PAYLOAD`):

```json
{
  "mode": "init | consolidate | memorize",
  "project": "my-app", "bundlePath": "memory/", "round": 1,
  "baseCommit": "abc1234", "headCommit": "def5678", "commitCount": 7,   // memorize only
  "areas": [ { "id": "patterns", "title": "Patterns & Conventions", "description": "How code here is written" }, ... ],
  "memories": [ {
    "id": "patterns/error-handling",          // OKF concept ID = path minus .md
    "area": "patterns",
    "action": "create | update | delete | keep",
    "type": "Pattern", "title": "Error handling",
    "description": "one sentence", "tags": ["errors"],
    "files": ["src/lib/errors.ts"],           // repo paths described — staleness anchor
    "body": "proposed markdown",
    "existingBody": "…",                      // when action != create
    "stale": false, "staleReasons": [],
    "conflict": null,                          // or { "with": "<id>", "summary": "…" } (memorize)
    "sourceCommits": ["def5678"]              // memorize provenance
  } ]
}
```

**Output** — exactly one JSON line on stdout:

- `{ "type": "review-approved", "mode": "...", "decisions": [ { "id", "verdict" } ] }`
- `{ "type": "review-feedback", "mode": "...", "decisions": [...], "comments": [ { "id", "comment" } ], "general": "…" }`
- `{ "type": "cancel" }` / `{ "type": "timeout" }`

Verdicts: `accept` (default) | `reject` (discard draft) | `delete` (remove existing file / confirm deletion). Page emits `review-feedback` iff any comment or the general box is non-empty — that is also the `hasChanges()` contract flipping the primary button "Accept" → "Send review".

**Reactions (all three SKILL.md files):**

| Output | Reaction |
|---|---|
| approved | Write accepted concepts, delete `delete`-verdict files, regenerate affected `index.md`s, append dated `log.md` entries, run `node scripts/…/validate.mjs memory/`. memorize also sets `last_memorized_commit: <headCommit from payload>` (not "HEAD now" — avoids racing commits made during review). Report summary. |
| feedback | Revise commented drafts + general note, `round++`, re-invoke server. Nothing written mid-loop. |
| cancel / timeout | Write nothing, tell the user explicitly (never silent); memorize does NOT advance the pointer. |

## Review page UI

Everything through `renderPage()`; all data via `embed()`/`esc()`; handlers via `addEventListener`, never string-built `on*=` attributes.

- **Header:** `okf-memory — <mode> review`, subtitle `<project> · memory/ · round <n>` (+ `base..head, N commits` for memorize); theme toggle, Cancel, primary button.
- **Mode banner:** init "Drafted N memories"; consolidate "N existing — M stale"; memorize "N drafts from K commits — J conflicts" (red count).
- **Area sections** in payload order; **memory cards** with: title + type chip + action badge (NEW/UPDATE/DELETE/KEEP) + amber STALE badge (inline staleReasons) + red CONFLICT badge — clicking it scrolls to and flash-highlights the conflicting card and expands an inline panel with `conflict.summary`; meta line (concept id, tags, description, sourceCommits); body via `mdToHtml()` collapsed past ~12 lines; collapsible "current version" (`existingBody`) for update/delete/keep; verdict segmented control + comment textarea.
- **Footer:** general comment textarea.

## OKF bundle written into the target project

```
memory/
├── index.md          # ROOT: frontmatter { okf_version: "0.1", last_memorized_commit: <sha> } + area listing
├── log.md            # newest-first, ISO dates, **Creation**/**Update**/**Deletion** bold-lead entries
├── architecture/  ├── decisions/  ├── patterns/  ├── pitfalls/  └── setup/
    └── index.md (no frontmatter) + <kebab-slug>.md concepts
```

Concept frontmatter: `type` (required), `title`, `description` (one sentence, reused verbatim in index entries), `tags`, `timestamp` (ISO 8601, refreshed on every accepted write), extension key `files:` (repo-relative paths — the staleness anchor; OKF §4.1 permits producer keys). Type values: `Architecture`, `Decision` (+ `status: accepted|superseded`, `date:`), `Pattern`, `Pitfall`, `Setup`. Cross-links between memories use bundle-absolute form (`/patterns/error-handling.md`). Slugs `index`/`log` forbidden (reserved names). Root-index frontmatter carve-out per OKF §11; extra key tolerated per §4.1/§9 — one README sentence noting this.

## SKILL.md runbooks

**okf-init:** (1) preflight — if `memory/index.md` exists, stop and point at `/okf-consolidate`; (2) analyze — `git ls-files`, README, manifests/lockfiles, entry points, CI, test setup, representative source for conventions; (3) draft ~3–8 memories per area, `action: create`, quality bar: each must tell an agent something non-obvious it needs to act correctly; (4) heredoc-pipe `mode:init` payload into `server.mjs` (path via `${CLAUDE_PLUGIN_ROOT}/skills/okf-init/server.mjs` in Claude Code, else sibling `../okf-init/server.mjs` relative to the SKILL.md's directory — both documented); (5) branch on output per table; (6) on approval write bundle: area dirs, concepts, area indexes, root index with `last_memorized_commit: $(git rev-parse HEAD)`, `log.md` **Initialization** entry, run validator; (7) report + remind user to paste the README snippet into CLAUDE.md/AGENTS.md.

**okf-consolidate:** (1) preflight — bundle must exist (else suggest `/okf-init`); check `../okf-init/server.mjs` exists with helpful "install all okf skills together" error; (2) load every non-reserved `.md` under `memory/`; (3) **staleness scan** — union of `files:` and inline repo paths vs `git ls-files`; (4) propose `update`/`delete` for stale/outdated, everything else `keep` with `existingBody`; (5) run review `mode:consolidate`; (6) apply verdicts, regenerate indexes, append `log.md`, validate; `last_memorized_commit` untouched.

**okf-memorize:** (1) preflight as above; (2) range: `git rev-parse HEAD` → `headCommit`; read `last_memorized_commit` → `baseCommit`; **validate `git cat-file -e <base>^{commit}`** — on failure (rebase/force-push) warn and fall back to `git merge-base HEAD <base>`, else offer full-history review or abort; `git log --oneline <base>..HEAD` empty → "nothing to memorize", stop; (3) study: `git log --stat`, `git diff --stat`, targeted `git show`; skip formatting/lockfile churn; (4) draft create/update/delete with `sourceCommits`; (5) **conflict detection** — compare each draft against existing memories in the same area + `grep -ril <keywords> memory/` hits; on contradiction set `conflict: {with, summary}` AND include the contradicted memory as a `keep` card so both sides are on screen; (6) run review `mode:memorize`; (7) on approval write, regenerate indexes, `log.md` under today's date, set `last_memorized_commit: <headCommit>`, validate.

## README.md

Install sections: **Claude Code** (`/plugin marketplace add <repo-url>` + `/plugin install okf-memory`; dev loop `claude --plugin-dir .`) and **opencode / Codex CLI / pi** (copy all three `skills/okf-*` folders into the harness's skills dir — must be installed together since two skills invoke `okf-init/server.mjs`; hedge exact paths, they change per harness). Plus the exact snippet to paste into `CLAUDE.md` / `AGENTS.md`:

````markdown
## Project memory (okf-memory)

This repo keeps agent-curated project knowledge in `memory/` — an OKF bundle
covering architecture, decisions, patterns/conventions, bugs/pitfalls, and setup.

Before starting any task:
1. Read `memory/index.md` to see what knowledge areas exist.
2. Follow links into the relevant area index and open only the concept docs
   that match your task (progressive disclosure — don't read everything).
3. Unsure whether memory covers a topic? `grep -ril "<keyword>" memory/`.

Treat `memory/` as authoritative for how to work in this codebase.
After fixing a bug or making a notable decision, suggest running /okf-memorize.
````

## Tests (`npm test` → `node --test`; helper from §2.4 with `OKF_NO_OPEN=1, OKF_PORT=0, OKF_CANCEL_GRACE_MS=250`)

1. `server.test.mjs` — the 5 mandatory cases: GET/ + submit-echo/exit 0; `</script>`-in-payload cannot break the embedded script; wrong/missing token → 403, server stays alive, no stdout leak; non-local Host → 403; cancel grace-period semantics (reload ≠ close; `?now=1` immediate).
2. `review.test.mjs` — memorize fixture renders CONFLICT badge + summary; consolidate fixture renders STALE badge; cards grouped under correct areas; POSTed feedback body round-trips verbatim.
3. `sync.test.mjs` — bundled `skills/okf-init/lib/*` byte-equal to root `lib/*`.
4. `validate.test.mjs` — good fixture bundle passes; missing frontmatter / empty `type` / reserved-slug concept fail.
5. Manual: `npm run preview:<mode>` with fixtures in a real browser; end-to-end `claude --plugin-dir .` in a scratch repo: `/okf-init` → accept → validator green → commit something → `/okf-memorize` → conflict flag + `log.md` + pointer advance.

## Build order

1. Scaffolding: `plugin.json`, `marketplace.json`, `package.json`, `.gitignore`.
2. `lib/server.mjs` (verbatim §2.1, OKF_ prefix) + `lib/ui.mjs` (from §2.1 bullets).
3. `skills/okf-init/server.mjs` (all three modes) + fixtures; iterate visually via previews.
4. `scripts/sync.mjs`, run + commit copies; `scripts/validate.mjs`.
5. All tests green (server/review/sync/validate) **before** any SKILL.md.
6. `skills/okf-init/SKILL.md`; end-to-end on a sample repo.
7. `okf-consolidate` + `okf-memorize` SKILL.md; exercise both flows.
8. `README.md`; final pass against both specs.

## Outstanding fixes (code review, 2026-07-02)

- `lib/server.mjs` `/cancel` handler: `if (done || cancelTimer) return;` drops an explicit `?now=1` cancel if a grace-period timer from an earlier pagehide beacon is already pending — server never calls `finish()`, CLI-side caller hangs. Immediate cancel must pre-empt/clear any pending grace timer.
- `scripts/sync.mjs` / `test/sync.test.mjs`: the test calls `sync()` before asserting equality, so it overwrites the bundled `skills/okf-init/lib/` copy from root `lib/` first — drift between the two can never be detected. Test must assert equality *before* (or instead of) syncing.
- `lib/ui.mjs` `post(payload, okMsg)`: the `okMsg` parameter is accepted but never used, so the confirmation screen always renders the server's fixed `doneHtml()` text regardless of whether the user approved or sent feedback. Needs to actually surface `okMsg` (or be removed if the distinction isn't wanted).
- All three `SKILL.md` runbooks (`okf-init`, `okf-consolidate`, `okf-memorize`) invoke `node scripts/validate.mjs memory/` as an unqualified relative path — fails once run from a target project's cwd, and is architecturally unreachable on non-Claude-Code harnesses since `scripts/` is never copied/synced into the skill folders. Needs the same path-anchoring treatment already used for the server invocation (`${CLAUDE_PLUGIN_ROOT}/...` in Claude Code, documented sibling path otherwise) — likely means `scripts/validate.mjs` itself needs to be reachable from a droppable skill install, not just referenced correctly.

## Known risks (accepted, mitigations in place)

- Root-index frontmatter key is a mild stretch of OKF §11 — spec requires consumers to tolerate unknown keys; documented in README.
- Cross-skill dependency (consolidate/memorize → okf-init's server) soft-violates "droppable folder" — the pattern EXTENSION.md §2.3 itself blesses; preflight check + "install together" docs.
- `last_memorized_commit` invalidated by rebase — handled explicitly in memorize step 2.
- Whole-bundle payload on consolidate — fine at tens of memories; bodies collapsed by default; per-area consolidate is a future escape hatch.
- User edits `memory/` while review is open — last-writer-wins; SKILL.md warns not to.
