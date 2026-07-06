---
name: okf-memorize
description: Use when the user types /okf-memorize or wants to draft reviewed okf-memory updates from commits since last_memorized_commit.
---

<!-- markdownlint-disable MD013 -->

# okf-memorize

Draft and review new okf-memory entries from commits since `last_memorized_commit`.

## Preconditions

1. `memory/index.md` must exist. If it does not, stop and suggest `/okf-init`.
2. The shared server must exist at `../okf-init/server.mjs` relative to this skill directory. If not, stop with: `Install all okf-memory skills together; okf-memorize uses okf-init/server.mjs for review.`
3. Do not write `memory/` while the browser review is open.

## Determine commit range

1. Set `headCommit=$(git rev-parse HEAD)`.
2. Read `last_memorized_commit` from `memory/index.md` as `baseCommit`.
3. Validate it with `git cat-file -e "$baseCommit^{commit}"`.
4. If invalid, warn that history may have been rebased/force-pushed. Try `git merge-base HEAD "$baseCommit"`; if that fails or is not useful, offer a full-history review or abort.
5. If `git log --oneline "$baseCommit..HEAD"` is empty, report `nothing to memorize` and stop. An empty or short range is expected in repos driven by iterator: `/iterator-implement` evaluates each accepted chunk wave and advances `last_memorized_commit` itself, so only commits made outside that flow accumulate here.

## Study changes

Use:

- `git log --oneline --stat "$baseCommit..HEAD"`
- `git diff --stat "$baseCommit..HEAD"`
- targeted `git show <commit>` for relevant changes

Skip pure formatting, generated files, and lockfile churn unless it changes setup instructions.

## Draft memories

Draft `create`, `update`, or `delete` cards with `sourceCommits`. Focus on lasting project knowledge: architecture, decisions, patterns, pitfalls, and setup. Do not memorize every code change.

## Conflict detection

For every draft, compare against existing memories in the same area and keyword hits from:

```bash
grep -ril "<keyword>" memory/
```

If the draft contradicts an existing memory, set:

```json
"conflict": { "with": "patterns/existing-memory", "summary": "What contradicts what." }
```

Also include the contradicted memory as an `action: "keep"` card so both sides appear in the review.

## Review

Invoke the shared review server:

```bash
node ../okf-init/server.mjs <<'OKF_PAYLOAD'
{ "mode": "memorize", "project": "...", "bundlePath": "memory/", "round": 1, "baseCommit": "...", "headCommit": "...", "commitCount": 1, "areas": [], "memories": [] }
OKF_PAYLOAD
```

## React

- `review-feedback`: revise commented drafts plus the general note, increment `round`, and invoke the server again. Write nothing mid-loop.
- `cancel` / `timeout`: write nothing, explicitly report the cancellation/timeout, and do **not** advance `last_memorized_commit`.
- `review-approved`: apply verdicts.

Verdicts:

- `accept`: write the proposed concept body/frontmatter.
- `reject`: discard the proposal and leave disk unchanged.
- `keep`: leave the existing concept unchanged.
- `delete`: remove the existing concept file.

## Finish on approval

Regenerate area indexes and `memory/index.md`, preserving OKF fields and setting:

```yaml
last_memorized_commit: <headCommit from payload>
```

Use the reviewed `headCommit`, not `HEAD now`, to avoid racing commits made during review.

Append newest-first `memory/log.md` entries under today's ISO date using bold leads such as `**Creation**`, `**Update**`, and `**Deletion**`.

Run:

```bash
node scripts/validate.mjs memory/
```

Report created/updated/deleted/rejected counts, conflicts resolved or left, and the advanced commit pointer.
