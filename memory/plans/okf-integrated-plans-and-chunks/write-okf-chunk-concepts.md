---
type: Work Chunk
title: Write OKF chunk concepts
description: Write each implementation chunk as a separate type Work Chunk concept beneath its plan directory.
status: done
done: 2026-07-06
size: medium
lines_estimate: 160
plan: plans/okf-integrated-plans-and-chunks
depends_on:
  - plans/okf-integrated-plans-and-chunks/write-okf-plan-concepts
files:
  - skills/okf/SKILL.md
  - skills/okf/gather.mjs
  - skills/okf/server.mjs
timestamp: 2026-07-06T14:07:37Z
tags:
  - planning
  - chunks
  - okf
---

# Implementation notes

Create-chunk and chunking flows should produce `memory/plans/<plan-slug>/<chunk-slug>.md` with `status`, full-ID `depends_on`, `files`, implementation notes, and test expectations. Regenerate the affected plan directory index and the plan file's `# Chunks` section with bundle-absolute links.

# Snippets

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

```js
chunks.push({
  id: rel,
  planId: fm.plan || rel.split("/").slice(0, -1).join("/"),
  title: fm.title || rel,
  description: fm.description || "",
  status: fm.status || "",
  dependsOn: Array.isArray(depends) ? depends : [],
  files: Array.isArray(files) ? files : [],
  body,
});
```

# Depends on

* [Write OKF plan concepts](/plans/okf-integrated-plans-and-chunks/write-okf-plan-concepts.md) — chunks live under an approved plan and must link back to it.

# Tests

Verify chunk discovery, plan grouping, dependency display, and dashboard actions for implement/test/mark-done targets.

# Blast radius

If chunk metadata is malformed, implementation ordering and dashboard action routing can target the wrong work item.
