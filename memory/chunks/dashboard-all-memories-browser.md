---
type: Chunk
title: Dashboard all-memories browser
description: Update the dashboard UI to show every memory concept, not just area counts and plan/chunk cards, with stable slug identifiers and per-memory actions.
status: done
size: medium
lines_estimate: 180
depends_on: [slugged-draft-chunk-model, extension-memory-contract]
files: ["skills/okf/gather.mjs", "skills/okf/server.mjs", "test/gather.test.mjs", "test/dashboard.test.mjs", "test/fixtures/dashboard.json"]
timestamp: "2026-07-06T15:12:00.316Z"
tags: []
done: 2026-07-06
commits:
  - sha: 6b07b1b8d37cd77c885b07acff05d66fada535e9
    kind: implement
    date: 2026-07-06
---

# Implementation notes

Have gather return a lightweight memories list for all non-index/non-log concept documents including id/slug, type, title, description, status, files, and path. Render a browsable section in /okf grouped by area/type, reusing escaped HTML helpers and the shared renderPage shell. Keep existing memory status, area cards, and plan/chunk sections working; add tests that assert ordinary memories and draft chunks are visible by slug.

# Snippets

```js
function areaCards() {
  // currently shows counts and Add memory actions only
  return `<section class="panel"><h2>Knowledge areas</h2><div class="grid areas">...`;
}
```

```js
const data = await readPayload();
const areas = Array.isArray(data.areas) ? data.areas : [];
const plans = Array.isArray(data.plans) ? data.plans : [];
const chunks = Array.isArray(data.chunks) ? data.chunks : [];
```

# Depends on

* [Slugged draft chunk model](/chunks/slugged-draft-chunk-model.md)
* [Extension memory contract](/chunks/extension-memory-contract.md)

# Blast radius

Dashboard HTML and fixture output change; action tests must continue to post exactly one JSON line.
