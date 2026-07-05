<!-- markdownlint-disable MD013 -->

# Building an installable pi extension package

This is a self-contained recipe for turning a set of pi extensions, skills,
prompt templates, or themes into an installable package. Hand it to pi in a
fresh repo with a prompt like:

> read `docs/EXTENSION.md` and scaffold an installable pi package called
> `<name>` that adds `<commands/tools/skills>`.

Replace `<APP>` everywhere below with your package name (lowercase,
hyphenated). Use `<app>` for variable/function prefixes if you need a valid JS
identifier.

---

## 1. What pi installs

pi installs **packages** from npm, git, or local paths. A package is just a
repository/directory with a `package.json` that tells pi which resources to
load.

Typical package layout:

```text
<APP>/
├── package.json
├── extensions/
│   └── <APP>.ts          # or .js; exports default function (pi extension)
├── skills/
│   └── <APP>-<step>/
│       ├── SKILL.md      # optional agent skill
│       └── server.mjs    # optional browser UI helper used by the skill
├── prompts/              # optional prompt templates (*.md)
└── themes/               # optional themes (*.json)
```

Minimum `package.json`:

```json
{
  "name": "<APP>",
  "version": "1.0.0",
  "description": "One-sentence package description.",
  "type": "module",
  "license": "MIT",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*",
    "typebox": "*"
  }
}
```

Only include resource types you actually ship. If you only have an extension,
`"pi": { "extensions": ["./extensions"] }` is enough.

If you omit the `pi` key, pi still auto-discovers conventional directories:
`extensions/`, `skills/`, `prompts/`, and `themes/`. Prefer an explicit `pi`
manifest for installable packages because it documents intent and lets users
filter resources.

---

## 2. Install and development loop

Try the package once without writing settings:

```bash
pi -e ./path/to/<APP>
pi -e git:github.com/user/<APP>
pi -e npm:<APP>
```

Install globally for all projects:

```bash
pi install ./path/to/<APP>
pi install git:github.com/user/<APP>@v1.0.0
pi install npm:<APP>@1.0.0
```

Install into the current project settings instead of user settings:

```bash
pi install -l git:github.com/user/<APP>@v1.0.0
```

Useful management commands:

```bash
pi list
pi remove git:github.com/user/<APP>
pi update --extensions
pi update --all
```

Source forms pi accepts:

```text
npm:@scope/pkg@1.2.3
npm:pkg
git:github.com/user/repo@tag-or-commit
git:git@github.com:user/repo@tag-or-commit
https://github.com/user/repo@tag-or-commit
/absolute/local/path
./relative/local/path
```

Notes:

- Extensions run with full user permissions. Only install trusted packages.
- Git and npm installs run `npm install` when `package.json` exists.
- Runtime dependencies belong in `dependencies`.
- pi core imports (`@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`,
  `@earendil-works/pi-tui`, `typebox`) should be `peerDependencies` with `"*"`.

---

## 3. Writing a pi extension

A pi extension is a TypeScript or JavaScript module that default-exports a
factory function. pi passes an `ExtensionAPI` object into that function.

`extensions/<APP>.ts`:

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function <app>Extension(pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("<APP> loaded", "info");
  });

  pi.registerCommand("<APP>-hello", {
    description: "Say hello from <APP>",
    handler: async (args, ctx) => {
      ctx.ui.notify(`Hello ${args.trim() || "world"}!`, "info");
    },
  });

  pi.registerTool({
    name: "<APP>_echo",
    label: "<APP> Echo",
    description: "Echo text back to the agent",
    parameters: Type.Object({
      text: Type.String({ description: "Text to echo" }),
    }),
    async execute(_toolCallId, params) {
      return {
        content: [{ type: "text", text: params.text }],
        details: { echoed: params.text },
      };
    },
  });
}
```

Common extension capabilities:

- `pi.registerCommand("name", ...)` adds `/name` commands.
- `pi.registerTool(...)` adds tools the model can call.
- `pi.on("tool_call", ...)` can inspect, mutate, or block tool calls.
- `pi.on("before_agent_start", ...)` can add context or modify the system
  prompt for a turn.
- `ctx.ui` can show notifications, confirmations, selectors, inputs, editors,
  widgets, and custom TUI components.
- `pi.sendUserMessage(...)` can queue a user message or command.

Do not start long-lived watchers, servers, or subprocesses in the extension
factory. Start session-scoped resources from `session_start` or from the command
that needs them, and clean them up in `session_shutdown`.

---

## 4. Exposing friendly commands for bundled skills

If your package includes skills, add a tiny extension that registers ergonomic
commands and forwards them to pi's skill command syntax.

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const COMMANDS = [
  {
    name: "<APP>-init",
    description: "Initialize <APP> in this project.",
  },
  {
    name: "<APP>-review",
    description: "Review and update <APP> output.",
  },
];

export default function <app>Extension(pi: ExtensionAPI) {
  for (const command of COMMANDS) {
    pi.registerCommand(command.name, {
      description: command.description,
      handler: async (args = "") => {
        const trimmed = args.trim();
        pi.sendUserMessage(
          `/skill:${command.name}${trimmed ? ` ${trimmed}` : ""}`,
        );
      },
    });
  }
}
```

Then ship matching skills:

```text
skills/<APP>-init/SKILL.md
skills/<APP>-review/SKILL.md
```

Each `SKILL.md` needs frontmatter that helps pi decide when to load it:

```markdown
---
name: <APP>-init
description: Use when the user types /<APP>-init or asks to initialize <APP>.
---

# <APP>-init

Follow these steps...
```

After install, users can run either the friendly command:

```text
/<APP>-init
```

or the direct skill invocation:

```text
/skill:<APP>-init
```

---

## 5. Browser UI skills: local server pattern

For rich human review flows, a skill can run a small local HTTP server. The
skill sends a JSON payload to the server over stdin, the server opens a browser
page, the user edits/approves, and the server prints exactly one JSON result to
stdout.

```text
pi skill instructions       server.mjs                 browser
  │ JSON via stdin              │                         │
  ├────────────────────────────>│                         │
  │                             ├─ open 127.0.0.1 URL ───>│
  │                             │                         │ user reviews
  │                             │<──── POST /submit ──────┤
  │<──── stdout JSON line ──────┤                         │
```

`SKILL.md` should invoke the server with a heredoc, never a temp file:

```sh
node /absolute/path/to/skills/<APP>-review/server.mjs << 'PAYLOAD'
{ "branch": "main", "items": [] }
PAYLOAD
```

The server should:

1. Bind only to `127.0.0.1`.
2. Generate a per-run random token and require it on every request.
3. Check the `Host` header to prevent DNS rebinding.
4. Retry or use an ephemeral port if the preferred port is busy.
5. Print one JSON line on submit, cancel, and timeout.
6. Escape embedded JSON so values containing `</script>` cannot break out of
   inline scripts.
7. Use env vars for knobs, prefixed with your app name (`<APP>_NO_OPEN`,
   `<APP>_PORT`, etc.).

Minimal server skeleton:

```js
#!/usr/bin/env node
import http from "node:http";
import { exec } from "node:child_process";
import { randomBytes } from "node:crypto";

function readStdin() {
  return new Promise((resolve) => {
    let raw = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (raw += chunk));
    process.stdin.on("end", () => resolve(raw));
    if (process.stdin.isTTY) resolve("");
  });
}

function embed(value) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

const payload = JSON.parse((await readStdin()) || "{}");
const token = randomBytes(16).toString("hex");
const hostRe = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;
let done = false;

function finish(obj, code = 0) {
  if (done) return;
  done = true;
  process.stdout.write(JSON.stringify(obj) + "\n");
  server.close();
  setTimeout(() => process.exit(code), 20).unref();
}

const html = `<!doctype html>
<html><body>
  <h1>${payload.title || "Review"}</h1>
  <button id="ok">Approve</button>
  <script>
    const D = ${embed(payload)};
    const token = new URL(location.href).searchParams.get("t");
    document.getElementById("ok").onclick = async () => {
      await fetch(`/submit?t=${token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "approved", data: D }),
      });
      document.body.textContent = "Sent to pi. You can close this tab.";
    };
  </script>
</body></html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (!hostRe.test(String(req.headers.host || "")) || url.searchParams.get("t") !== token) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  if (req.method === "POST" && url.pathname === "/submit") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      res.writeHead(204).end();
      finish(JSON.parse(body || "{}"));
    });
    return;
  }

  res.writeHead(404).end();
});

server.listen(0, "127.0.0.1", () => {
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}/?t=${token}`;
  if (!process.env.<APP>_NO_OPEN) {
    const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start \"\"" : "xdg-open";
    exec(`${opener} "${url}"`);
  }
  process.stderr.write(`<APP>: listening on ${url}\n`);
});

setTimeout(() => finish({ type: "timeout" }), 7_200_000).unref();
```

For multi-step browser UIs, keep shared helpers in `lib/` while developing,
then copy them into each skill folder before publishing. Skill folders should be
self-contained so they still work when users copy or filter individual skills.
Add a test that byte-compares bundled copies against `lib/` to prevent drift.

---

## 6. Testing checklist

Add scripts like these:

```json
{
  "scripts": {
    "test": "node --test",
    "preview:review": "<APP>_NO_OPEN=1 node skills/<APP>-review/server.mjs < test/fixtures/review.json"
  }
}
```

Recommended tests:

1. `pi -e .` loads without startup errors.
2. Each registered command appears and forwards to the expected skill.
3. Each custom tool validates parameters and returns the promised result shape.
4. Browser servers accept stdin payloads, serve `GET /`, echo `POST /submit`,
   and exit 0.
5. Payload strings containing `</script>` remain data, not executable markup.
6. Missing/wrong token and non-local `Host` requests return 403.
7. Runtime dependencies are in `dependencies`; pi core packages are peers.

---

## 7. Publish checklist

1. Choose an npm name or git repository users can install.
2. Add `"keywords": ["pi-package"]` for gallery discoverability.
3. Add a `pi` manifest in `package.json` with only shipped resource types.
4. Put extension entrypoints under `extensions/` or list exact files in the
   manifest.
5. Put skills under `skills/<name>/SKILL.md` and make browser-UI skills
   self-contained.
6. Run tests and `pi -e .` from a separate throwaway project.
7. Tag git releases (`v1.0.0`) or publish to npm.
8. Document install commands:

```bash
pi install git:github.com/user/<APP>@v1.0.0
# or
pi install npm:<APP>@1.0.0
```

Also document one-session trial:

```bash
pi -e git:github.com/user/<APP>@v1.0.0
```
