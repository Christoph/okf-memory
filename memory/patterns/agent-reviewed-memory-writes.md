---
type: Pattern
title: Agent-reviewed memory writes
description: Memory files are written only after browser approval; feedback loops revise drafts without touching disk.
tags:
  - memory
  - review
  - workflow
timestamp: 2026-07-06T00:00:00.000Z
files:
  - skills/okf-init/SKILL.md
  - skills/okf-consolidate/SKILL.md
  - skills/okf-memorize/SKILL.md
  - skills/okf-init/server.mjs
---

# Pattern

The agent drafts memory cards, sends them to the review UI, and writes files only after `review-approved`. If the server returns `review-feedback`, revise the commented cards and general note, increment the round, and invoke the server again. Write nothing mid-loop.

`review-approved` decisions control what reaches disk: accepted create/update cards are written, rejected cards are discarded, keep cards stay untouched, and delete verdicts remove existing concept files. After writes, regenerate indexes, append `memory/log.md`, and run the validator.

This pattern applies to init, consolidate, memorize, and dashboard-triggered memory drafting.
