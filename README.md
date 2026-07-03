<!-- markdownlint-disable MD013 -->

# okf-memory

Project memory for coding agents, stored as an OKF knowledge bundle in a target repo's `memory/` directory. It captures architecture, decisions, patterns/conventions, pitfalls, and setup so agents can self-discover only the knowledge they need.

The bundle follows `docs/OKF_SPEC.md` progressive disclosure: start at `memory/index.md`, follow an area index, then open only relevant concept docs. `memory/index.md` includes `last_memorized_commit` as tolerated OKF extension metadata so `/okf-memorize` knows where to resume.

## Commands

- `/okf-init` — analyze a repo, draft memories, review them in a browser UI, then write the initial bundle.
- `/okf-consolidate` — review/update/merge/delete existing memories and flag stale file references.
- `/okf-memorize` — draft memories from commits since `last_memorized_commit`, flag conflicts, then advance the pointer on approval.

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

## Install: opencode / Codex CLI / pi

Copy all three skill folders into the harness's skills directory:

```text
skills/okf-init/
skills/okf-consolidate/
skills/okf-memorize/
```

Install them together. `okf-consolidate` and `okf-memorize` invoke `../okf-init/server.mjs` for the shared browser review UI. Exact skills paths vary by harness/version; use that tool's current skills documentation.

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
3. Unsure whether memory covers a topic? `grep -ril "<keyword>" memory/`.

Treat `memory/` as authoritative for how to work in this codebase.
After fixing a bug or making a notable decision, suggest running /okf-memorize.
````

## Development

```bash
npm test
npm run sync -- --check
npm run validate
npm run preview:init
npm run preview:consolidate
npm run preview:memorize
```

The preview commands launch the shared review server with fixtures. Set `OKF_NO_OPEN=1` to suppress opening a browser. `npm run validate` checks the fixture bundle in this repo.

Validate a target repo bundle:

```bash
node scripts/validate.mjs memory/
```
