---
type: Setup
title: Development commands
description: Use npm scripts for tests, sync checking, validation, and browser previews.
tags:
  - npm
  - tests
  - preview
timestamp: 2026-07-06T00:00:00.000Z
files:
  - package.json
  - README.md
  - test/server.test.mjs
  - test/review.test.mjs
  - scripts/sync.mjs
  - scripts/validate.mjs
---

# Commands

```bash
npm test
npm run sync -- --check
npm run validate
npm run preview:dashboard
npm run preview:init
npm run preview:consolidate
npm run preview:memorize
```

`npm test` runs `node --test test/*.test.mjs`. `npm run validate` validates the fixture bundle, not an arbitrary target repo. To validate a target bundle from this checkout, run `node scripts/validate.mjs memory/` with the desired bundle path.

Preview commands launch browser UIs with fixtures and honor `OKF_*` environment overrides such as `OKF_REMOTE`, `OKF_BIND_HOST`, `OKF_PORT`, `OKF_NO_OPEN`, `OKF_BROWSER`, and `BROWSER`.
