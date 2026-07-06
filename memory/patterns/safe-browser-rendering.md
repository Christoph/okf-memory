---
type: Pattern
title: Safe browser rendering helpers
description: Browser pages escape HTML, embed data through safe JSON, and attach event handlers in client JavaScript instead of string-built inline handlers.
tags:
  - browser-ui
  - security
  - rendering
timestamp: 2026-07-06T00:00:00.000Z
files:
  - lib/ui.mjs
  - skills/okf-init/server.mjs
  - skills/okf/server.mjs
  - test/server.test.mjs
  - test/review.test.mjs
---

# Pattern

Use `escHtml()` for HTML text and attributes, and `embed()` for JSON data embedded into `<script>` blocks. `embed()` escapes `<`, U+2028, and U+2029 so strings such as `</script>` stay data. The shared page shell inserts `SHARED_JS`, then skill-specific client JS.

Client behavior should be attached with `addEventListener`; avoid string-built `on*=` attributes. Markdown bodies are rendered client-side via the shared `mdToHtml()` helper rather than by trusting raw HTML from memory bodies.

When adding UI fields, keep all source data in the payload object and render through these helpers.
