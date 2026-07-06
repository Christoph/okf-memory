---
type: Work Chunk
title: Preserve root memory index
description: Make plan creation merge into the existing OKF root index instead of replacing project-memory metadata and area links.
status: done
done: 2026-07-06
size: small
lines_estimate: 80
plan: plans/okf-integrated-plans-and-chunks
depends_on: []
files:
  - memory/index.md
  - skills/okf/SKILL.md
  - README.md
timestamp: 2026-07-06T13:46:49Z
tags:
  - planning
  - okf
---

# Implementation notes

Codify the non-destructive contract for integrated planning. Plan creation must preserve `okf_version`, `last_memorized_commit`, existing area links, and unknown frontmatter while adding the `/plans/` link only when missing. This is the foundation for all later writer flows.

# Snippets

```md
# Areas

* [Architecture](/architecture/) - How the okf-memory package, skills, servers, and memory bundle fit together.
* [Setup](/setup/) - Commands, install flows, and development loop.
* [Plans](/plans/) - Approved work plans and implementation chunks tracked as OKF concepts.
```

```md
When creating or updating plan/chunk concepts:
1. Preserve OKF frontmatter and human-readable markdown bodies.
2. Keep each chunk in a separate `.md` file.
3. Regenerate `memory/plans/index.md` and the affected plan directory `index.md`.
```

# Depends on

None.

# Tests

Verify a planning write leaves existing root frontmatter and area links intact, including `last_memorized_commit`.

# Blast radius

If this is wrong, iterator-style planning can clobber existing project memories and break `/okf-memorize` resume state.
