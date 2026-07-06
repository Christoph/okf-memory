<!-- markdownlint-disable MD013 -->

# okf-memory

Project memory for coding agents, stored as an OKF knowledge bundle in a target repo's `memory/` directory. It captures architecture, decisions, patterns/conventions, pitfalls, and setup so agents can self-discover only the knowledge they need.

The bundle follows `docs/OKF_SPEC.md` progressive disclosure: start at `memory/index.md`, follow an area index, then open only relevant concept docs. `memory/index.md` includes `last_memorized_commit` as tolerated OKF extension metadata so `/okf-memorize` knows where to resume. New bundles also include `memory/EXTENSIONS.md`, an OKF `Reference` concept that tells other extensions how to read concept IDs/slugs, preserve unknown metadata, write safe updates, regenerate indexes, append `memory/log.md`, and validate the bundle.

## Commands

- `/okf` — open the project memory plane dashboard for memory state, OKF plans, per-chunk files, and agent action callbacks.
- `/okf-init` — analyze a repo, draft memories, review them in a browser UI, then write the initial bundle.
- `/okf-consolidate` — review/update/merge/delete existing memories and flag stale file references.
- `/okf-memorize` — draft memories from commits since `last_memorized_commit`, flag conflicts, then advance the pointer on approval.

Plans and implementation chunks are represented as normal OKF markdown concepts. Legacy plan-scoped chunks may live under `memory/plans/`, while iterator-style chunks live under `memory/chunks/<slug>.md`; for those files, the slug is the stable chunk identity used by the dashboard and tooling. Each chunk has frontmatter such as `type: Chunk` or `type: Work Chunk`, `status: draft|pending|done`, `depends_on: [...]`, and `files: [...]` so draft and pending work remains human-readable and diffable. Adding plans to an existing OKF bundle is non-destructive: keep root `memory/index.md` frontmatter such as `okf_version` and `last_memorized_commit`, preserve existing area links and unknown keys, and add plan/chunk links only when missing.

## iterator integration

okf-memory and [iterator](https://github.com/Christoph/iterator) share one `memory/` bundle: okf-memory owns the knowledge areas and the `last_memorized_commit` pointer, iterator owns `plan.md`/`chunks/`/`design.md`, and `index.md`/`log.md` are joint. iterator's deterministic writer merges (never overwrites) the root index, so okf metadata and area links survive every plan/chunk regeneration. When `/iterator-implement` lands an accepted chunk wave, it evaluates the diff for durable knowledge, shows proposed memory creates/updates as toggleable cards in its commit review, writes the accepted ones into the areas (regenerating area indexes and appending `memory/log.md`), and advances `last_memorized_commit` to the accepted commit. The knowledge base stays current as work lands; `/okf-memorize` only has a backlog for commits made outside the iterator flow.

## Install: Claude Code

From a published repository:

```bash
/plugin marketplace add <repo-url>
/plugin install okf-memory
```

Development loop from this checkout:

```bash
claude --plugin-dir .
```

## Install: pi

From git:

```bash
pi install git:github.com/Christoph/okf-memory
```

Or try it for one session without writing settings:

```bash
pi -e git:github.com/Christoph/okf-memory
```

This package exposes a small pi extension plus the skills under `skills/`. After install/restart, use the friendly commands:

```text
/okf
/okf-init
/okf-consolidate
/okf-memorize
```

The skills are also available directly as `/skill:okf`, `/skill:okf-init`, `/skill:okf-consolidate`, and `/skill:okf-memorize`.

`pi install Christoph/okf-memory` is not a supported pi source form in current pi releases; use the `git:github.com/...` shorthand or a full URL such as `pi install https://github.com/Christoph/okf-memory`.

## Install: opencode / Codex CLI

Copy all skill folders into the harness's skills directory:

```text
skills/okf/
skills/okf-init/
skills/okf-consolidate/
skills/okf-memorize/
```

Install them together. `okf-consolidate` and `okf-memorize` invoke `../okf-init/server.mjs` for the shared browser review UI, while `/okf` uses `okf/server.mjs` for the dashboard. Exact skills paths vary by harness/version; use that tool's current skills documentation.

## Project-agent snippet

Paste this into `CLAUDE.md` or `AGENTS.md` in repos that use okf-memory:

````markdown
## Project memory (okf-memory)

This repo keeps agent-curated project knowledge in `memory/` — an OKF bundle
covering architecture, decisions, patterns/conventions, bugs/pitfalls, and setup.

Before starting any task:
1. Read `memory/index.md` to see what knowledge areas exist.
2. Follow links into the relevant area index and open only the concept docs
   that match your task (progressive disclosure — don't read everything).
3. If `memory/EXTENSIONS.md` exists, follow it when reading or updating memory
   from tools, skills, or extensions.
4. Unsure whether memory covers a topic? `grep -ril "<keyword>" memory/`.

Treat `memory/` as authoritative for how to work in this codebase.
After fixing a bug or making a notable decision, suggest running /okf-memorize.
````

## Development

```bash
npm test
npm run sync -- --check
npm run validate
npm run preview:dashboard
npm run preview:init
npm run preview:consolidate
npm run preview:memorize
```

The preview commands launch the shared review server with fixtures. Remote sessions (SSH, Docker/Podman containers) are detected automatically: the server binds `0.0.0.0` so a forwarded/published port reaches it from the host, skips launching a browser, and prints a `http://127.0.0.1:<port>/` URL to open on the host. Overrides: `OKF_REMOTE=1|0` forces remote/local mode, `OKF_BIND_HOST` pins the bind address, `OKF_PORT` pins the port (default 8888, walks up if busy), `OKF_NO_OPEN=1` suppresses opening a browser, and `OKF_BROWSER`/`BROWSER` set a custom opener (`none` disables). `npm run validate` checks the fixture bundle in this repo.

Validate a target repo bundle:

```bash
node scripts/validate.mjs memory/
```
