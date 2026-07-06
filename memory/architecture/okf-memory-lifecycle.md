---
type: Architecture
title: OKF memory lifecycle
description: okf-memory manages a target repo's memory/ bundle through init, dashboard, consolidate, and memorize workflows.
tags:
  - okf
  - memory
  - workflow
timestamp: 2026-07-06T00:00:00.000Z
files:
  - README.md
  - docs/OKF_SPEC.md
  - skills/okf/SKILL.md
  - skills/okf-init/SKILL.md
  - skills/okf-consolidate/SKILL.md
  - skills/okf-memorize/SKILL.md
---

# Lifecycle

A target project stores agent knowledge as an OKF bundle under `memory/`. The root `memory/index.md` lists areas and carries okf-memory extension metadata, especially `last_memorized_commit`. Area indexes provide progressive disclosure into individual concept files.

`/okf-init` creates the first bundle after browser review. `/okf` opens the project memory plane, displays memory status, plan/chunk concepts, and returns action requests. `/okf-consolidate` reviews existing memories, detects stale file anchors, and proposes updates/deletions. `/okf-memorize` studies commits since `last_memorized_commit`, drafts lasting knowledge, and advances the pointer only after approval.

Plans and chunks are also normal OKF markdown concepts under `memory/plans/`; keep each chunk in its own file so status and dependencies remain diffable.
