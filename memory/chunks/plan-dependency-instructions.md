---
type: Chunk
title: Plan dependency instructions
description: Update iterator planning instructions and examples so agents use only gathered manifest dependencies when drafting the plan payload.
status: pending
size: small
lines_estimate: 80
depends_on: [manifest-dependency-discovery]
files: ["/home/agent/.pi/agent/git/github.com/Christoph/iterator/skills/iterator-plan/SKILL.md", "/home/agent/.pi/agent/git/github.com/Christoph/iterator/package.json", "/home/agent/.pi/agent/git/github.com/Christoph/iterator/README.md"]
timestamp: "2026-07-06T17:50:14.361Z"
tags: []
---

# Implementation notes

Revise iterator-plan/SKILL.md to state that `dependencies` in the plan payload must be copied from the scripted gather result or left empty; do not invent package/service dependencies from the goal. Mention that gather derives the list from real manifests and that user edits in the review UI can still be preserved on approval. Update package preview/example payloads and any README/docs wording that currently imply freeform `<pkg-or-service> — <why>` entries without manifest grounding.

# Snippets

```md
It prints `{ step, branch, title, exists, status, legacy, plan: { goal,
architecture, keyDecisions, productFit }, dependencies }` — the branch, whether
a plan exists (with its current sections pre-parsed for revising), and whether
legacy `PLAN.md`/`CHUNKS.md` files exist.
```

```json
"dependencies": ["<pkg-or-service> — <why>"]
```

# Depends on

* [Manifest dependency discovery](/chunks/manifest-dependency-discovery.md)

# Blast radius

Agent planning behavior, package preview scripts, and user expectations for dependency chips in the plan review UI.
