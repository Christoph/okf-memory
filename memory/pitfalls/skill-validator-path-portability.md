---
type: Pitfall
title: Validator path portability
description: The skill runbooks currently say to run node scripts/validate.mjs memory/, which only works from this checkout and is fragile for copied skills.
tags:
  - validation
  - skills
  - portability
timestamp: 2026-07-06T00:00:00.000Z
files:
  - skills/okf-init/SKILL.md
  - skills/okf-consolidate/SKILL.md
  - skills/okf-memorize/SKILL.md
  - scripts/validate.mjs
  - PLAN.md
---

# Pitfall

All three review skills currently document validation as `node scripts/validate.mjs memory/`. That relative path is safe while developing inside this repository, but a real target repo or manually copied skill folder may not have `scripts/validate.mjs` at that location.

# How to handle it

When changing skill write paths or installer behavior, anchor the validator path the same way the servers are anchored, or make a validator available inside the droppable skill set. Until that is fixed, do not assume the documented validation command is portable outside this checkout.
