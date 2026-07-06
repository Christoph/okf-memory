---
type: Work Chunk
title: Cover integrated plan flow
description: Add tests and fixtures proving integrated plans and chunks are discovered, rendered, validated, and non-destructive.
status: pending
size: medium
lines_estimate: 180
plan: plans/okf-integrated-plans-and-chunks
depends_on:
  - plans/okf-integrated-plans-and-chunks/write-okf-plan-concepts
  - plans/okf-integrated-plans-and-chunks/write-okf-chunk-concepts
files:
  - test/gather.test.mjs
  - test/dashboard.test.mjs
  - test/validate.test.mjs
  - test/fixtures/dashboard.json
  - scripts/validate.mjs
timestamp: 2026-07-06T13:24:59Z
tags:
  - tests
  - okf
---

# Implementation notes

Cover root index preservation, nested plan/chunk discovery, dashboard action payloads, validator acceptance, and log/index regeneration. Tests should prevent regressions where a planning flow overwrites `memory/index.md` or loses `last_memorized_commit`.

# Snippets

```js
assert.equal(p.plans.length, 1);
assert.equal(p.plans[0].id, "plans/dashboard-ui");
assert.deepEqual(p.plans[0].chunks, [
  "plans/dashboard-ui/render-dashboard",
]);
```

```js
assert.match(page.text, /Dashboard UI/);
assert.match(page.text, /Render dashboard/);
assert.match(page.text, /Draft memory from prompt/);
```

# Depends on

* [Write OKF plan concepts](/plans/okf-integrated-plans-and-chunks/write-okf-plan-concepts.md) — tests need the approved plan layout.
* [Write OKF chunk concepts](/plans/okf-integrated-plans-and-chunks/write-okf-chunk-concepts.md) — tests need chunk metadata and dashboard rendering behavior.

# Tests

Run `npm test` and `node scripts/validate.mjs memory/`. Add focused assertions before expanding broader integration coverage.

# Blast radius

Without coverage, future iterator or dashboard changes can silently regress the integrated memory layout.
