---
type: Architecture
title: Package and skill layout
description: The repo is a pi-installable package whose skills own the agent workflows and whose extension only forwards friendly commands.
tags:
  - pi
  - skills
  - package
timestamp: 2026-07-06T00:00:00.000Z
files:
  - package.json
  - extensions/okf-memory.js
  - skills/okf/SKILL.md
  - skills/okf-init/SKILL.md
  - skills/okf-consolidate/SKILL.md
  - skills/okf-memorize/SKILL.md
---

# Structure

`package.json` declares this repo as a pi package with `extensions/` and `skills/`. The extension in `extensions/okf-memory.js` is intentionally thin: it registers `/okf`, `/okf-init`, `/okf-consolidate`, and `/okf-memorize`, then sends `/skill:<name>` back to pi.

The durable behavior lives in the skill folders. Each `SKILL.md` is the runbook the agent follows, while browser-backed skills include their own `server.mjs` and synced `lib/` copies so copied skill folders can run outside this checkout.

When changing behavior, update the relevant `SKILL.md` first if the agent workflow changes; update the extension only when command names or forwarding change.
