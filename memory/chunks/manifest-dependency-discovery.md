---
type: Chunk
title: Manifest dependency discovery
description: Detect and parse real project dependency manifests so plan gathering can supply dependency chips from package.json, Cargo.toml, pyproject.toml, go.mod, or an empty list when none are declared.
status: done
size: medium
lines_estimate: 190
depends_on: []
files: ["skills/iterator/gather.mjs", "test/gather.test.mjs", "test/steps.test.mjs"]
timestamp: "2026-07-06T18:00:38.116Z"
tags: []
done: 2026-07-06
commits:
  - sha: 4532fbe2fa3158956e84487ba8454a9fbd71f263
    kind: implement
    date: 2026-07-06
---

# Implementation notes

Add small manifest-discovery helpers near gatherPlan in the iterator gather script. Start from the git/project root, prefer explicit manifest files, normalize entries as `name — source/scope` strings, and avoid guessing packages from code or prose. Cover package.json dependencies/devDependencies/peerDependencies, Cargo.toml dependency tables, pyproject dependency arrays/tables, and go.mod require blocks with conservative parsing. If the manifest exists but declares no dependencies, return [] (as okf-memory's current package.json should). Add tests that build temporary fixtures with package.json and at least one other manifest format plus a no-dependency package.json case.

# Snippets

```js
export function gatherPlan(startDir) {
  const b = loadBundle(startDir);
  const s = b.plan?.sections || {};
  const dependencies = manifestDependencies(b.root);
  return {
    step: 'plan',
    branch: b.branch,
    dependencies,
    // ...
  };
}
```

# Blast radius

Plan gather payloads, plan-review dependency chips, and tests that assert the exact shape of `gatherPlan` output.
