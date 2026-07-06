---
type: Chunk
title: Slugged draft chunk model
description: Persist planned chunks as draft OKF files early and make slug/file identity the canonical identifier used by gather/server/UI payloads.
status: done
size: medium
lines_estimate: 140
depends_on: []
files: ["skills/okf/gather.mjs", "test/gather.test.mjs", "README.md"]
timestamp: "2026-07-06T14:46:20.587Z"
tags: []
done: 2026-07-06
commits:
  - sha: a13f9c962e953f42c770937a7c0e09ac9f0a2e8c
    kind: implement
    date: 2026-07-06
---

# Implementation notes

Extend the okf dashboard gatherer so chunk concepts are read from disk by slug rather than inferred only from memory/plans nesting. Preserve existing memory/plans support for compatibility, but normalize ids to the file-relative slug without .md. Add fixture coverage for draft status and slug identity so draft chunks remain visible before implementation.

# Snippets

```js
const conceptFiles = mdFilesUnder(mem);
// ... current gather scans memory/plans for Plan and Work Chunk records
const rel = relative(mem, p).replace(/\.md$/, "").split("\\").join("/");
```

```js
chunks.push({
  id: rel,
  planId: fm.plan || rel.split("/").slice(0, -1).join("/"),
  title: fm.title || rel,
  status: fm.status || "",
  dependsOn: Array.isArray(depends) ? depends : [],
});
```

# Blast radius

Changes the dashboard payload shape used by /okf and tests; keep legacy memory/plans fixtures working while adding draft chunk visibility.
