---
type: Decision
title: Use an OKF markdown bundle in target repos
description: Project memory is stored as markdown plus YAML frontmatter in each target repo instead of in an external database.
status: accepted
date: 2026-07-06
tags:
  - okf
  - storage
  - progressive-disclosure
timestamp: 2026-07-06T00:00:00.000Z
files:
  - README.md
  - docs/OKF_SPEC.md
  - PLAN.md
---

# Decision

Store memory in a target repository's `memory/` directory using OKF markdown files with YAML frontmatter. Use root and area `index.md` files for progressive disclosure, and use bundle-absolute links such as `/patterns/error-handling.md`.

# Rationale

The project optimizes for human readability, git diffs, portability across agents, and low-context consumption. Agents can start at `memory/index.md`, inspect the relevant area index, then open only the concept docs needed for the task.

# Consequences

Do not introduce a hidden database or generated-only state as the source of truth. Unknown frontmatter fields should be preserved and tolerated; `last_memorized_commit` is an okf-memory extension field on the root index.
