---
type: Plan
title: OKF-integrated plans and chunks
description: Store iterator plans and chunks as OKF concepts under memory/plans without clobbering project memories.
status: approved
branch: main
created: 2026-07-06
timestamp: 2026-07-06T13:24:59Z
tags:
  - planning
  - iterator
  - okf
files:
  - memory/index.md
  - skills/okf/SKILL.md
  - skills/okf/gather.mjs
  - skills/okf/server.mjs
---

# Goal

Build OKF-integrated planning/chunking so plans and chunks are stored as normal OKF concepts under `memory/plans/`, preserving the existing project-memory bundle instead of overwriting `memory/index.md`. This lets `/okf` show plan and chunk state alongside architecture, decisions, patterns, pitfalls, and setup memories.

# Architecture

Treat the existing `memory/` bundle as the source of truth. Add or update writer logic so plans use `type: Plan` concept files and chunks use separate `type: Work Chunk` files under `memory/plans/<plan-slug>/`, while retaining the root OKF index metadata such as `okf_version` and `last_memorized_commit`. Dashboard/gather code should discover these concepts mechanically from frontmatter, and any review UI should follow the existing short-lived browser server contract: one JSON payload in, exactly one JSON result out, and no disk mutation until approval.

# Dependencies

* No new runtime dependency — use existing markdown/frontmatter parsing and browser server patterns.
* Existing OKF bundle conventions — preserve root index metadata and bundle-absolute links.
* Iterator UI server — reuse for plan review while adapting writes to OKF concept layout.

# Key decisions

Do not create a second hidden state file or replace the current OKF memory index. Preserve unknown frontmatter fields and existing area links. Keep every chunk as a separate markdown concept with `status`, `depends_on`, and `files` metadata so dependencies, implementation state, and review history remain diffable. Regenerate only the affected plan indexes plus any missing `memory/plans/index.md` link from the root index.

# Product fit

This aligns iterator-style implementation planning with okf-memory's progressive-disclosure model and the `/okf` dashboard, giving agents one durable, human-readable memory plane for knowledge, plans, chunks, and action callbacks. It reduces the risk of iterator workflows clobbering project memories in repositories that already use OKF.

# Chunks

* [Preserve root memory index](/plans/okf-integrated-plans-and-chunks/preserve-root-memory-index.md) - Make plan creation merge into the existing OKF root index instead of replacing project-memory metadata and area links.
* [Write OKF plan concepts](/plans/okf-integrated-plans-and-chunks/write-okf-plan-concepts.md) - Write approved plans as type Plan OKF concept files under memory/plans with regenerated plan indexes.
* [Write OKF chunk concepts](/plans/okf-integrated-plans-and-chunks/write-okf-chunk-concepts.md) - Write each implementation chunk as a separate type Work Chunk concept beneath its plan directory.
* [Cover integrated plan flow](/plans/okf-integrated-plans-and-chunks/cover-integrated-plan-flow.md) - Add tests and fixtures proving integrated plans and chunks are discovered, rendered, validated, and non-destructive.
