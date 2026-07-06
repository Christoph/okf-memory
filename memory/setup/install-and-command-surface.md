---
type: Setup
title: Install and command surface
description: Install through pi git sources or Claude Code plugins; the package exposes friendly commands that map to direct skill invocations.
tags:
  - install
  - pi
  - claude
timestamp: 2026-07-06T00:00:00.000Z
files:
  - README.md
  - package.json
  - extensions/okf-memory.js
  - .claude-plugin/plugin.json
  - .claude-plugin/marketplace.json
---

# Install

For pi, use a supported source form such as:

```bash
pi install git:github.com/Christoph/okf-memory
pi -e git:github.com/Christoph/okf-memory
```

`pi install Christoph/okf-memory` is not supported by current pi releases. For Claude Code development, run `claude --plugin-dir .`; published installs go through `/plugin marketplace add <repo-url>` and `/plugin install okf-memory`.

# Commands

The friendly commands are `/okf`, `/okf-init`, `/okf-consolidate`, and `/okf-memorize`. The direct skill forms are `/skill:okf`, `/skill:okf-init`, `/skill:okf-consolidate`, and `/skill:okf-memorize`.
