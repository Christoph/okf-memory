---
type: Decision
title: Sync shared libs into droppable skills
description: Browser helper code is developed in root lib/ and copied into skill folders so skills work when installed together or copied manually.
status: accepted
date: 2026-07-06
tags:
  - skills
  - sync
  - portability
timestamp: 2026-07-06T00:00:00.000Z
files:
  - lib/server.mjs
  - lib/ui.mjs
  - skills/okf-init/lib/server.mjs
  - skills/okf-init/lib/ui.mjs
  - skills/okf/lib/server.mjs
  - skills/okf/lib/ui.mjs
  - scripts/sync.mjs
  - test/sync.test.mjs
---

# Decision

Keep canonical browser helpers in root `lib/`, but commit byte-for-byte copies inside browser-backed skills. `scripts/sync.mjs` copies `lib/server.mjs` and `lib/ui.mjs` into `skills/okf-init/lib/` and `skills/okf/lib/`; `test/sync.test.mjs` asserts those copies match.

# Rationale

Some harnesses install the whole package, while others copy skill folders. A copied browser skill still needs its `server.mjs` helper imports to resolve without reaching back into this source tree.

# Consequences

After editing root `lib/`, run `npm run sync` and keep the bundled skill copies in the same change. Do not hand-edit the skill `lib/` copies except as part of a deliberate sync change.
