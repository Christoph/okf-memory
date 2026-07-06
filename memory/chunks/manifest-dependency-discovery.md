---
type: Chunk
title: Manifest dependency discovery
description: Detect and parse real project dependency manifests so plan gathering can supply dependency chips from package.json, Cargo.toml, pyproject.toml, go.mod, or an empty list when none are declared.
status: pending
size: medium
lines_estimate: 190
depends_on: []
files: ["/home/agent/.pi/agent/git/github.com/Christoph/iterator/skills/iterator/gather.mjs", "/home/agent/.pi/agent/git/github.com/Christoph/iterator/test/gather.test.mjs"]
timestamp: "2026-07-06T17:50:14.361Z"
tags: []
---

# Implementation notes

Add small manifest-discovery helpers near gatherPlan in the iterator gather script. Start from the git/project root, prefer explicit manifest files, normalize entries as `name — source/scope` strings, and avoid guessing packages from code or prose. Cover package.json dependencies/devDependencies/peerDependencies, Cargo.toml dependency tables, pyproject dependency arrays/tables, and go.mod require blocks with conservative parsing. If the manifest exists but declares no dependencies, return [] (as okf-memory's current package.json should). Add tests that build temporary fixtures with package.json and at least one other manifest format plus a no-dependency package.json case.

# Snippets

```js
export function gatherPlan(startDir) {
  const b = loadBundle(startDir);
  const s = b.plan?.sections || {};
  const dependencies = (s['Dependencies'] || '').split('\n')
    .map(l => l.match(/^[*-]\s+(.*)$/))
    .filter(Boolean)
    .map(m => m[1].replaceAll('`', '').trim());
  return {
    step: 'plan',
    branch: b.branch,
    title: b.plan?.fm.title || '',
    exists: !!b.plan,
    status: b.plan?.fm.status || null,
    // ...
    dependencies,
  };
}
```

```js
function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), 'iterator-gather-'));
  git(root, 'init', '-q');
  mkdirSync(join(root, 'memory', 'chunks'), { recursive: true });
  // tests can add package.json/Cargo.toml fixtures under root
  return root;
}
```

# Blast radius

Plan gather payloads, plan-review dependency chips, and tests that assert the exact shape of `gatherPlan` output.
