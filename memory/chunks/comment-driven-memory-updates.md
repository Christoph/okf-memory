---
type: Chunk
title: Comment-driven memory updates
description: Let users request updates for any displayed memory via a comment and return deterministic dashboard actions that the skill can turn into reviewed memory edits.
status: pending
size: medium
lines_estimate: 150
depends_on: [dashboard-all-memories-browser]
files: ["skills/okf/server.mjs", "skills/okf/SKILL.md", "test/dashboard.test.mjs", "test/server.test.mjs"]
timestamp: "2026-07-06T14:36:18.550Z"
tags: []
---

# Implementation notes

Add per-memory comment controls in the dashboard, emit a structured dashboard-action with action such as update-memory, target set to the memory slug, and prompt/comment text. Update the /okf skill instructions to process that action by reading the targeted memory, drafting an update through the existing reviewed memory-write path, and never mutating files directly from browser state. Cover empty-comment handling, target slug preservation, and existing close/action behavior in tests.

# Snippets

```js
function sendAction(action, target, prompt) {
  post({ type: 'dashboard-action', action: action, target: target || null, prompt: prompt || '' }, 'Action sent');
}
```

```js
document.querySelectorAll('[data-action]').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var action = btn.dataset.action;
    sendAction(action, btn.dataset.target || null, prompt);
  });
});
```

# Depends on

* [Dashboard all-memories browser](/chunks/dashboard-all-memories-browser.md)

# Blast radius

Adds new dashboard actions consumed by the agent skill; must preserve cancel/timeout and existing init/consolidate/memorize callbacks.
