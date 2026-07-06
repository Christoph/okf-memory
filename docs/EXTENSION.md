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

1. Bind to `127.0.0.1` locally; in remote sessions (SSH, container/microVM
   sandbox) bind `0.0.0.0` so a forwarded port can reach it (see
   "Remote sessions" below).
2. Check the `Host` header locally to prevent DNS rebinding. (A per-run URL
   token is optional hardening; iterator/okf-memory dropped theirs as
   dev-only friction — with the host-side publish kept on loopback the
   exposure matches any local dev server.)
3. Keep the default port **fixed** and take it over from a lingering instance
   of yourself (see "Single-instance takeover" below). Walk to another port
   only when a *foreign* process owns it, and always print the real URL.
4. Print one JSON line on submit, cancel, timeout, **and termination signals**
   (SIGTERM/SIGINT/SIGHUP → `{ "type": "cancel" }`), so the skill's
   one-JSON-line contract survives interrupts and takeover, and the port is
   always freed.
5. Escape embedded JSON so values containing `</script>` cannot break out of
   inline scripts.
6. Use env vars for knobs, prefixed with your app name (`<APP>_NO_OPEN`,
   `<APP>_PORT`, `<APP>_REMOTE`, `<APP>_BIND_HOST`, `<APP>_REGISTRY`,
   `<APP>_NO_TAKEOVER`, etc.).

Minimal server skeleton:

```js
#!/usr/bin/env node
import http from "node:http";
import { exec } from "node:child_process";

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
    document.getElementById("ok").onclick = async () => {
      await fetch("/submit", {
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
  if (!hostRe.test(String(req.headers.host || ""))) {
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
  const url = `http://127.0.0.1:${port}/`;
  if (!process.env.<APP>_NO_OPEN) {
    const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start \"\"" : "xdg-open";
    exec(`${opener} "${url}"`);
  }
  process.stderr.write(`<APP>: listening on ${url}\n`);
});

for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"]) {
  process.on(sig, () => finish({ type: "cancel" }));
}
setTimeout(() => finish({ type: "timeout" }), 7_200_000).unref();
```

(The skeleton omits the takeover/registry logic for brevity — see the next
section and the production implementations in iterator's and okf-memory's
`lib/server.mjs`.)

For multi-step browser UIs there are two layouts:

- **Self-contained skills**: keep shared helpers in `lib/` while developing,
  copy them into each skill folder before publishing, and add a test that
  byte-compares bundled copies against `lib/` to prevent drift. Each skill
  folder then works when copied alone.
- **UI as control plane** (what iterator uses): ONE hub skill owns the server
  and all step views (`lib/views/<step>.mjs`, view picked by a `step` field in
  the stdin payload); the other skills are logic-only and invoke the hub's
  server as `<skill-dir>/../<hub>/server.mjs`. One port, one tab, no
  per-skill server drift — at the cost that the skill folders must be
  installed together. Prefer this when the skills form one flow with a shared
  dashboard; combined with the single-instance takeover below it makes the
  UI feel like one continuously-updating page.

### Ship the payload gathering as code, not prompt instructions

If the SKILL.md describes *what* state to collect (read these files, count
those, run this git query) but ships no tool to collect it, the agent
re-improvises a collector script on every invocation — in the field this
meant ~100 lines of ad-hoc Python and 79 seconds per dashboard open, with
counts that could differ between runs and zero test coverage. Anything
mechanical belongs in a shipped `gather.mjs` that prints the payload JSON, so
the SKILL.md's whole gathering section collapses to:

```sh
node <skill-dir>/gather.mjs | node <skill-dir>/server.mjs
```

Resolve the project root inside the script (`git rev-parse --show-toplevel`
from the cwd, optional explicit-path argument) — do not assume the skill's
install directory has anything to do with the user's repo. Export the
functions (`gather()`, `frontmatter()`, …) so they are unit-testable against
a fixture repo. The split to aim for: **mechanical logic in scripts, semantic
logic in the model** — the agent only reacts to the user's answer and writes
files.

### Stale-tab guard: a per-run id on /cancel and /submit

A consequence of one fixed shared port: a tab left over from an EARLIER round
(abandoned mid-round, superseded by takeover) fires its `pagehide` `/cancel`
beacon at whatever server *currently* owns the port when it is finally
closed — silently cancelling a live round the moment the user tidies their
tabs (this presented as "the dashboard cancels as soon as I start typing").
Fix: embed a per-run id in each page (`const __RUN = …`), echo it as `?r=` on
`/submit` and `/cancel`, and have the server ignore mismatches (log to
stderr; 409 for `/submit`). Accept requests *without* an id so curl, scripts,
and tests keep working — the id is round-matching, not auth.

### Single-instance takeover: one UI on one fixed port

A one-shot server can be orphaned — the agent session is interrupted, the
tab is never answered, a background invocation is forgotten — and it then
holds the port until its timeout (hours). The naive fallback, "walk up to the
next free port", is exactly wrong in sandboxes: the host forwards ONE fixed
port, so a server that drifts to `<port>+1` is unreachable
(`ERR_CONNECTION_REFUSED` on the host). Treat the UI as a **singleton on a
fixed port**:

1. After `listen()`, write `{ pid, port }` to a per-user registry file:
   `join(tmpdir(), "<app>-ui-" + userInfo().uid + ".json")` (override:
   `<APP>_REGISTRY`), mode `0600`. Remove your own entry on exit.
2. On startup, before binding: read the registry; if it names another pid,
   verify the holder really is a lingering instance of *your* app by fetching
   a tokenless, read-only status endpoint on the recorded port
   (`GET /__<app>/status` → `{ app, step, pid }`). Pids get reused — never
   kill on the registry entry alone.
3. If app and pid match: SIGTERM it, poll `process.kill(pid, 0)` up to ~2 s,
   SIGKILL as a last resort, delete the registry file, then bind the fixed
   port. The evicted server's signal handler prints `{ "type": "cancel" }`,
   so its (dead or abandoned) skill invocation still gets a valid JSON line.
4. `<APP>_NO_TAKEOVER=1` opts out (tests, deliberate side-by-side runs).

Test-suite gotcha: `node --test` runs test *files* in parallel. If every
spawned server shares the real registry they take each other over mid-test —
give each spawn a unique `<APP>_REGISTRY` (e.g. `tmpdir()/<app>-test-<uuid>`)
and share one only in the dedicated takeover test. Worth testing: status
endpoint answers without auth; SIGTERM → `{"type":"cancel"}` + exit 0; a
second server evicts the first AND lands on the same port; `<APP>_NO_TAKEOVER`
walks instead.

### Remote sessions: reaching the UI from the host

When pi runs inside a Docker sandbox, devcontainer, or SSH session, the
browser lives on the *host*, not next to the server. Two things break:

1. `127.0.0.1` inside the sandbox is not the host's `127.0.0.1` — a
   loopback-bound server is unreachable from the host even with a port
   forward in place (`ERR_CONNECTION_REFUSED`).
2. `open`/`xdg-open` inside a headless sandbox has no browser to launch.

The fix (this is what `lib/server.mjs` implements): detect remote sessions,
bind all interfaces there, skip the opener, and print a URL the *host* can
click. Detection order — explicit override, then SSH markers, then container
markers:

```js
export function isRemoteSession(env = process.env) {
  const override = String(env.<APP>_REMOTE ?? "").toLowerCase();
  if (override === "1" || override === "true") return true;
  if (override === "0" || override === "false") return false;
  if (env.SSH_TTY || env.SSH_CONNECTION) return true;
  return existsSync("/.dockerenv") || existsSync("/run/.containerenv");
}
```

Behavior by mode:

| | local | remote |
| --- | --- | --- |
| bind host | `127.0.0.1` | `0.0.0.0` (override: `<APP>_BIND_HOST`) |
| port | fixed default (`<APP>_PORT`); single-instance takeover keeps it stable; walk up only past foreign processes | same — the takeover is what keeps a `port:port` forward valid across runs |
| browser | auto-open via `open`/`xdg-open`/`BROWSER` | skip; print `http://127.0.0.1:<port>/` to stderr for the host |

Always print the URL with `127.0.0.1` as the display host, never `0.0.0.0` —
`0.0.0.0` is a bind address, not a clickable URL, and through a forward the
host reaches the server on its own loopback anyway.

The server side alone is not enough: the sandbox must also publish the port
to the host. Some environments detect microVM/sandbox images automatically
(`/.dockerenv` is absent there), so set `<APP>_REMOTE=1` explicitly in the
sandbox image. The variable name is always the uppercase app name plus
`_REMOTE` — for this package (`okf-memory` → `OKF`) that is `OKF_REMOTE`:

```dockerfile
ENV <APP>_REMOTE=1
# e.g. for okf-memory:
ENV OKF_REMOTE=1
```

Per environment:

- **Docker sandboxes (`sbx`)**: publish with the explicit `host:container`
  form — `sbx ports <sandbox> --publish 8888:8888`. A bare `--publish 8888`
  maps to a *random* host port (and adds a new one on every call), so the
  printed URL will not match. **Two hard-won rules** (`sbx ports --help`:
  "publish … ports for a *running* sandbox"):
  1. `sbx ports` only takes effect on a **running** sandbox. Publishing right
     after `sbx create` (state: created, not running) or against a stopped
     sandbox silently leaves you with zero forwards.
  2. Publishes do **not** survive the sandbox being stopped — re-publish on
     every start, *after* the sandbox is up. `sbx exec <sandbox> true` is the
     documented way to boot a stopped sandbox without attaching; publish
     after it, then attach with `sbx run --name <sandbox>` (the bare
     positional form puts the sandbox name where the CLI expects an *agent*).
     See the `pisbx` startup function in pi-docker-sandbox-setup's README for
     the full boot → publish → verify → attach sequence.
- **VS Code devcontainers / Codespaces**: ports are forwarded automatically;
  check the Ports tab for the host-side address.
- **Plain SSH**: forward manually, e.g. `ssh -L 8888:localhost:8888 host` or
  a `LocalForward` entry in `~/.ssh/config`.

Then open the printed URL (`http://127.0.0.1:8888/`) in the host browser.
With single-instance takeover the server stays on the fixed port across runs;
the stderr line always shows the real port and must match the published one.

Troubleshooting `ERR_CONNECTION_REFUSED` on the host — walk the chain from
the host inward:

1. `lsof -nP -iTCP:8888 -sTCP:LISTEN` **on the host**. A live publish shows a
   host-side proxy listening even when the app inside is down; no listener
   means the browser is refused before the sandbox is involved — the publish
   is missing (see the running-sandbox rules above).
2. `sbx ls` — the PORTS column is the truth. Empty column = no forwards for
   that sandbox; fix with `sbx ports <sandbox> --publish 8888:8888` while it
   runs.
3. Only then look inside: is a server actually listening right now? These
   are one-shot servers — they only run while a skill is waiting for an
   answer, so a URL from a finished round trip is *expected* to refuse.
   Re-run the skill and use the freshly printed URL; check the stderr
   "listening on" line for the port.

Security: binding `0.0.0.0` exposes the UI to whatever network the sandbox
is attached to. Keep the host-side publish on loopback (`127.0.0.1:8888`,
not `0.0.0.0:8888`), keep the `Host` check, and remember that without a
token anyone who can reach the published port can answer as the user — add
per-run token hardening back if the sandbox shares a network with other
workloads.

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
6. Non-local `Host` requests return 403 locally (relaxed when bound beyond
   loopback).
7. `GET /__<app>/status` answers without auth; SIGTERM prints
   `{"type":"cancel"}` and exits 0; a second server evicts a lingering one
   and binds the SAME fixed port; `<APP>_NO_TAKEOVER=1` port-walks instead.
   Give every spawned test server a unique `<APP>_REGISTRY` — `node --test`
   runs files in parallel and shared registries make servers evict each
   other mid-test.
8. A `/cancel` or `/submit` carrying a mismatched run id (`?r=`) is ignored
   (409 for `/submit`) and the flow keeps running; the live page's own id is
   accepted.
9. `gather.mjs` builds the correct payload from a fixture repo (and an empty
   repo yields the uninitialized shape).
10. Runtime dependencies are in `dependencies`; pi core packages are peers.

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
