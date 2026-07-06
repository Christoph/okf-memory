# Patterns & Conventions

How code and workflows are written in this repo.

* [Agent-reviewed memory writes](/patterns/agent-reviewed-memory-writes.md) - Memory files are written only after browser approval; feedback loops revise drafts without touching disk.
* [One JSON line server results](/patterns/one-json-line-server-results.md) - Local UI servers must resolve every user, timeout, and signal path by printing one machine-readable JSON object to stdout.
* [Safe browser rendering helpers](/patterns/safe-browser-rendering.md) - Browser pages escape HTML, embed data through safe JSON, and attach event handlers in client JavaScript instead of string-built inline handlers.
