---
type: Pitfall
title: Immediate cancel can be masked by a pending grace timer
description: The shared server's /cancel handler returns early when any cancel grace timer exists, so a later ?now=1 cancel may not pre-empt it.
tags:
  - server
  - cancel
  - known-bug
timestamp: 2026-07-06T00:00:00.000Z
files:
  - lib/server.mjs
  - skills/okf-init/lib/server.mjs
  - skills/okf/lib/server.mjs
  - PLAN.md
  - test/server.test.mjs
---

# Pitfall

`lib/server.mjs` starts a grace timer for ordinary `/cancel` pagehide requests so reloads do not cancel the workflow. The current handler checks `if (done || cancelTimer) return;` before checking `?now=1`, which means an explicit immediate cancel sent while a grace timer is pending can be ignored until the timer fires.

# How to handle it

If you touch cancel handling, make `?now=1` clear/pre-empt any pending grace timer before returning. Add a regression test that first sends `/cancel`, then sends `/cancel?now=1`, and expects immediate `{"type":"cancel"}`.
