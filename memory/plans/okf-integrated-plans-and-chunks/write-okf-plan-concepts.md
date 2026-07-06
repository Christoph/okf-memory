---
type: Work Chunk
title: Write OKF plan concepts
description: Write approved plans as type Plan OKF concept files under memory/plans with regenerated plan indexes.
status: pending
size: medium
lines_estimate: 140
plan: plans/okf-integrated-plans-and-chunks
depends_on:
  - plans/okf-integrated-plans-and-chunks/preserve-root-memory-index
files:
  - skills/okf/SKILL.md
  - skills/okf/gather.mjs
  - memory/log.md
timestamp: 2026-07-06T13:24:59Z
tags:
  - planning
  - okf
---

# Implementation notes

Implement or document the `create-plan` path so approved plan reviews produce `memory/plans/<plan-slug>.md`, `memory/plans/index.md`, and `memory/plans/<plan-slug>/index.md`. The writer should keep plan metadata human-readable, preserve existing bundle state, and append a newest-first `memory/log.md` entry.

# Snippets

```text
memory/plans/index.md
memory/plans/<plan-slug>.md
memory/plans/<plan-slug>/index.md
memory/plans/<plan-slug>/<chunk-slug>.md
```

```js
if (type === "plan") {
  plans.push({
    id: rel,
    title: fm.title || rel,
    description: fm.description || "",
    status: fm.status || "",
    chunks: [],
  });
}
```

# Depends on

* [Preserve root memory index](/plans/okf-integrated-plans-and-chunks/preserve-root-memory-index.md) — establishes the non-destructive root-index merge contract.

# Tests

Add or update coverage proving approved plans are discoverable by `gather.mjs` and visible in the `/okf` dashboard.

# Blast radius

If plan concept writing is inconsistent, dashboard plan state will drift from the markdown source of truth.
