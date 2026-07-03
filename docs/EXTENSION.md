# Building a Claude Code extension: the server+browser-UI pattern

This file is a **self-contained recipe**, extracted from the `iterator` plugin.
Hand it to Opus in a fresh repo with a prompt like *"read EXTENSION.md and
scaffold a new Claude Code plugin called `<name>` that does `<X>`, following
this pattern"* — it should not need anything else from the `iterator` repo.

It covers two things: (1) the mechanics of a Claude Code plugin (manifest,
skills, discovery), and (2) a reusable **local-server + browser-UI** harness
for skills that need rich human input (click-to-edit text, diffs, graphs,
drag/drop) that plain chat can't do well. Skip part 2 if your skill only needs
`AskUserQuestion`-style prompts.

Replace `<APP>` everywhere below with your extension's name (lowercase,
hyphenated — it becomes the skill-name prefix, e.g. `myapp-review`).

---

## 1. What a Claude Code plugin actually is

A plugin is a directory with a manifest plus a `skills/` folder. Nothing is
compiled or bundled — Claude Code reads it directly.

```
<plugin-root>/
├── .claude-plugin/
│   ├── plugin.json        # manifest: name, version, description, author, license
│   └── marketplace.json   # only needed for persistent (non --plugin-dir) installs
└── skills/
    └── <APP>-<step>/
        └── SKILL.md        # required: YAML frontmatter (name, description) + instructions
```

`plugin.json`:

```json
{
  "name": "<APP>",
  "version": "1.0.0",
  "description": "One-sentence description shown in /plugin install listings.",
  "author": "Your Name",
  "license": "MIT"
}
```

`marketplace.json` (lets `/plugin marketplace add <path>` + `/plugin install
<APP>` work; not needed for `claude --plugin-dir .` dev loop):

```json
{
  "name": "<APP>",
  "owner": { "name": "Your Name" },
  "plugins": [
    { "name": "<APP>", "source": "./", "description": "Same one-liner as plugin.json." }
  ]
}
```

**Skills are auto-discovered** from `skills/*/SKILL.md` — the manifest does
not list them. A skill is just a directory with `SKILL.md`; a `server.mjs` (or
any other file) next to it is only invoked because `SKILL.md`'s instructions
tell Claude to run it.

`SKILL.md` frontmatter contract:

```markdown
---
name: <APP>-<step>
description: One paragraph. Front-load *when to use this* — Claude's skill
  router matches on this text, not the body. Mention explicit trigger phrases
  ("Use when the user types /<APP>-<step>, asks to review X, or wants Y").
---

# <APP>-<step>

Prose instructions for Claude: numbered **Steps**, exact shell commands to
run, and the exact JSON shape to expect back. Treat this as a runbook you're
writing for yourself, executed fresh with no other context each time.
```

Load it for development with `claude --plugin-dir /path/to/<plugin-root>` —
no build step, no `npm install` required if you stick to Node built-ins.

---

## 2. The local-server + browser-UI pattern

**Why a local server at all?** A skill can't render rich UI in the chat
transcript, and a plain webpage can't write back to disk or talk to Claude.
The trick: Claude spawns a tiny Node HTTP server bound to `127.0.0.1`, pipes a
JSON payload into it over **stdin** (never a temp file), the server renders
that payload as a page and opens the browser, the user interacts and the page
`POST`s a JSON result to `/submit`, the server **prints that JSON to stdout
and exits**, and Claude reads stdout as the skill's tool output. One
round-trip = one server process.

```
Claude                    server.mjs                  Browser
  │  build JSON payload        │                          │
  │──── pipe via heredoc ─────>│                           │
  │                            │─ opens http://127.0.0.1  ─>│
  │                            │  :<port>/?t=<token>       │
  │                            │                          │  user edits, clicks Accept
  │                            │<──── POST /submit ────────│
  │<─── stdout: JSON line ─────│  (prints + exits)         │
  │  parse, act, maybe re-run  │                           │
```

### 2.1 The reusable engine (copy verbatim)

Two files carry **all** of the generic machinery — server, token auth, page
chrome, escaping, markdown rendering. Every skill's own `server.mjs` is a thin
wrapper around these. Put them at `lib/server.mjs` and `lib/ui.mjs` in your
plugin root.

**`lib/server.mjs`** — stdin→JSON, HTTP server, `/submit` + `/cancel`, token
auth, port retry, 2h timeout:

```js
#!/usr/bin/env node
import http from 'node:http';
import { exec } from 'node:child_process';
import { randomBytes } from 'node:crypto';

export function readStdin() {
  return new Promise(resolve => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', c => (raw += c));
    process.stdin.on('end', () => resolve(raw));
    if (process.stdin.isTTY) resolve('');
  });
}

export async function readPayload() {
  const raw = await readStdin();
  try { return JSON.parse(raw || '{}'); }
  catch { return {}; }
}

const TIMEOUT_MS = 7_200_000; // 2 hours
const CANCEL_GRACE_MS = parseInt(process.env.APP_CANCEL_GRACE_MS || '2500', 10);
const LOCAL_HOST_RE = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;

export function serve({ step = 'app', html }) {
  const startPort = parseInt(process.env.APP_PORT || '8888', 10);
  const MAX_PORT_RETRIES = 20;
  const token = randomBytes(16).toString('hex');
  let done = false;
  let cancelTimer = null;

  const finish = (obj, exitCode = 0) => {
    if (done) return;
    done = true;
    if (obj) process.stdout.write(JSON.stringify(obj) + '\n');
    try { server.close(); } catch {}
    process.exit(exitCode);
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (!LOCAL_HOST_RE.test(String(req.headers.host || '')) ||
        url.searchParams.get('t') !== token) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }
    if (req.method === 'GET' && url.pathname === '/') {
      if (cancelTimer) { clearTimeout(cancelTimer); cancelTimer = null; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } else if (req.method === 'POST' && url.pathname === '/submit') {
      let body = '';
      req.on('data', c => (body += c));
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(doneHtml());
        if (!done) {
          done = true;
          process.stdout.write((body.trim() || '{}') + '\n');
          try { server.close(); } catch {}
          setTimeout(() => process.exit(0), 30).unref();
        }
      });
    } else if (req.method === 'POST' && url.pathname === '/cancel') {
      let body = '';
      req.on('data', c => (body += c));
      req.on('end', () => {
        res.writeHead(204); res.end();
        if (done || cancelTimer) return;
        if (url.searchParams.get('now') === '1') { finish({ type: 'cancel' }); return; }
        cancelTimer = setTimeout(() => finish({ type: 'cancel' }), CANCEL_GRACE_MS);
      });
    } else {
      res.writeHead(404); res.end();
    }
  });

  const onListen = () => {
    const { port } = server.address();
    const url = `http://127.0.0.1:${port}/?t=${token}`;
    if (!process.env.APP_NO_OPEN) {
      const opener = process.platform === 'win32' ? 'start ""'
        : process.platform === 'darwin' ? 'open' : 'xdg-open';
      exec(`${opener} "${url}"`);
    }
    process.stderr.write(`<APP>: ${step} listening on ${url}\n`);
  };

  const tryListen = (port, attemptsLeft) => {
    const onError = err => {
      if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
        tryListen(port + 1, attemptsLeft - 1);
      } else if (err.code === 'EADDRINUSE') {
        server.removeListener('error', onError);
        server.once('error', e => {
          process.stderr.write(`<APP>: server error: ${e.message}\n`);
          finish(null, 1);
        });
        server.listen(0, '127.0.0.1', onListen);
      } else {
        process.stderr.write(`<APP>: server error: ${err.message}\n`);
        finish(null, 1);
      }
    };
    server.once('error', onError);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', onError);
      onListen();
    });
  };

  tryListen(startPort, MAX_PORT_RETRIES);

  setTimeout(() => {
    process.stderr.write('<APP>: timeout (2h), no response received\n');
    finish({ type: 'timeout' });
  }, TIMEOUT_MS).unref();
}

export function doneHtml(msg = 'Sent to Claude') {
  return `<!DOCTYPE html><html data-theme="dark"><head><meta charset="UTF-8"><style>
*{box-sizing:border-box;margin:0;padding:0}body{background:#0d1117;color:#7ee787;
font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;
height:100vh;flex-direction:column;gap:12px}p{color:#8b949e;font-size:14px}</style></head>
<body><h2>✓ ${msg}</h2><p>You can close this tab.</p></body></html>`;
}
```

**`lib/ui.mjs`** — page shell: `embed()` (safe data injection), `escHtml()`,
themed CSS variables, header (theme toggle / Cancel / primary button),
`mdToHtml()`, and the client-side `post()`/cancel-beacon glue. This file is
long (~250 lines) — copy it from `iterator`'s `lib/ui.mjs` rather than
retyping; the only things worth calling out are documented inline there and
repeated in §4 below (they're the load-bearing parts: `embed()`'s escaping,
the token-echoing `__api()` helper, and the `hasChanges()` contract). If you
don't have that file handy, reconstruct it from this spec:

- `embed(obj)` → `JSON.stringify` with `<`, `U+2028`, `U+2029` escaped, so a
  payload value can never terminate the inline `<script>` block it's embedded
  in.
- `escHtml(s)` → standard `&<>"` escaping for server-side string interpolation
  into HTML attributes/text.
- `renderPage({ step, subtitle, branch, title, data, body, clientJs, css,
  primaryIdle, primaryChanged, primary })` → returns a full HTML document:
  header with theme toggle + Cancel + a primary button whose label flips
  between `primaryIdle` (e.g. "Accept") and `primaryChanged` (e.g. "Send
  review") based on a step-supplied `hasChanges()` JS function; embeds `data`
  as `const D = <embed(data)>;`; appends shared client JS (see below) then
  `clientJs`.
- Shared client JS provides: `__TOKEN` (read from the URL, required on every
  request — see §4.2), `__api(path)` (appends `?t=<token>`), `post(payload,
  okMsg)` (POSTs to `/submit`, disables the button, shows "Sending…"),
  `sendCancel()` wired to `pagehide` (so a closed tab always cancels),
  `cancelFlow()` (explicit Cancel button → `/cancel?now=1`, immediate),
  `toggleTheme()`, `esc()`, and a dependency-free `mdToHtml()` (headings,
  lists, code fences, bold/italic/inline-code, and links — **link targets are
  allow-listed to `https?:|mailto:|[/.#]`**, so `javascript:` etc. never
  render as clickable).
- Two exported CSS strings: `BASE_CSS` (theme vars + header + `.md` prose
  styles) and `DIFF_CSS` (a shared diff-table style, only needed if your step
  shows a unified diff).

### 2.2 Anatomy of one skill's `server.mjs`

Every step's server is small: parse payload → provide body HTML + a bit of
client JS → call `serve()`. All chrome comes from the shared shell.

```js
#!/usr/bin/env node
/**
 * <APP>-<step>: <one-line purpose>.
 * input:  { branch, ...step-specific fields }
 * output: { type: "<step>-feedback"|"<step>-approved", ... } or the shared
 *         { type: "cancel" } / { type: "timeout" }.
 */
import { readPayload, serve } from './lib/server.mjs';
import { renderPage } from './lib/ui.mjs';

const CSS = `/* step-specific styles, appended after BASE_CSS */`;
const BODY = `<div id="root"></div>`; // step-specific markup
const JS = `
// D is the payload (const D = ...) injected by renderPage.
// Must define hasChanges() and onPrimary() — the shared header calls them.
function hasChanges(){ return /* did the user change anything? */ false; }
function onPrimary(){ post({ type: 'ok', branch: D.branch }, 'Done'); }
`;

const data = await readPayload();
const html = renderPage({
  step: '<step>', branch: data.branch, title: data.title,
  data, css: CSS, body: BODY, clientJs: JS,
  primaryIdle: 'Accept', primaryChanged: 'Send review',
});
serve({ step: '<step>', html });
```

`SKILL.md` drives it with a heredoc (never a temp file — the payload lives
only in the pipe):

```sh
node <skill-dir>/server.mjs << 'PAYLOAD'
{ "branch": "main", "title": "...", ... }
PAYLOAD
```

The process blocks until submit/cancel/timeout, then prints exactly one JSON
line to stdout. Claude's `SKILL.md` instructions must document that exact
shape and how to react to each of the three outcomes — cancel and timeout
should **never** be silently swallowed; always tell the user the flow ended
without changes.

### 2.3 Multiple skills sharing the shell (standalone-skill-folder pattern)

If your extension has more than one interactive step, don't import `lib/`
from the repo root at runtime — **each skill folder should be
self-contained**, because Agent-Skills harnesses (Claude Code, opencode, Codex
CLI, pi) expect a droppable `skills/<name>/` directory with no external
dependencies. Keep `lib/` at the repo root as the source of truth, and copy it
into each skill folder with a tiny sync script:

```js
// scripts/sync.mjs
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_SKILLS = ['<APP>-plan', '<APP>-review']; // skills with their own server.mjs

export const COPIES = SERVER_SKILLS.flatMap(skill => [
  ['lib/server.mjs', `skills/${skill}/lib/server.mjs`],
  ['lib/ui.mjs', `skills/${skill}/lib/ui.mjs`],
]);

export function sync() {
  for (const [src, dest] of COPIES) {
    mkdirSync(join(root, dirname(dest)), { recursive: true });
    copyFileSync(join(root, src), join(root, dest));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  sync();
  console.log(`synced ${COPIES.length} files into skill folders`);
}
```

Then each `skills/<name>/server.mjs` imports from its own `./lib/`, not
`../../lib/`. Add a regression test (`node:test`) that fails if a bundled copy
drifts from the source:

```js
import { COPIES, root } from '../scripts/sync.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
test('bundled lib/ matches source', () => {
  for (const [src, dest] of COPIES) {
    assert.equal(readFileSync(join(root, dest), 'utf8'), readFileSync(join(root, src), 'utf8'));
  }
});
```

A skill with **no UI of its own** (e.g. an "implement" step that just calls
another skill's review server in a different mode — see `iterator-implement`)
needs no `lib/` copy at all; its `SKILL.md` just shells out to
`skills/<other-skill>/server.mjs`.

### 2.4 Testing

No test framework needed — Node's built-in `node:test` + `fetch` is enough to
boot a real server and drive the full HTTP round-trip:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

function startServer(scriptPath, payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      env: { ...process.env, APP_NO_OPEN: '1', APP_PORT: '0', APP_CANCEL_GRACE_MS: '250' },
    });
    let stderr = '';
    const io = { child, url: null };
    child.stderr.on('data', d => {
      stderr += d;
      const m = stderr.match(/listening on (http:\/\/127\.0\.0\.1:\d+\/\?t=[0-9a-f]+)/);
      if (m && !io.url) { io.url = new URL(m[1]); resolve(io); }
    });
    child.on('exit', code => { if (!io.url) reject(new Error(`exited ${code}: ${stderr}`)); });
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}
```

Always set `APP_PORT=0` in tests (ephemeral port, no cross-test collisions)
and `APP_NO_OPEN=1` (no real browser). Minimum coverage worth having, in
priority order:

1. `GET /` serves the page and `POST /submit` echoes the body to stdout and
   exits 0.
2. A payload value containing `</script>` cannot break out of the embedded
   `<script>` block (this is the single most important test — see §3).
3. Requests missing the token, or with the wrong token, get 403 and the
   server keeps running (doesn't exit, doesn't leak to stdout).
4. A request with a non-local `Host` header gets 403 (DNS-rebinding check).
5. `/cancel` followed by a `GET /` within the grace period does **not**
   cancel (page-reload protection); `/cancel` with no follow-up `GET /` does
   cancel after the grace period; `/cancel?now=1` cancels immediately with no
   wait.

---

## 3. Lessons learned & caveats

These are bugs that actually shipped and got fixed, or non-obvious decisions
— read this before you "simplify" the engine.

- **Script-injection via embedded data (the big one).** Naively doing
  `const D = ${JSON.stringify(data)};` breaks the moment any string field
  contains the literal substring `</script>` — e.g. a diff line, a user
  comment, a code snippet. It closes the `<script>` tag early and everything
  after becomes raw (attacker- or accident-controlled) HTML/JS. Fix: always
  route embedded data through an `embed()` that escapes `<` (and, for
  paranoia, `U+2028`/`U+2029` line separators that can break JS string
  literals across browsers). Test this explicitly — it's the kind of bug that
  only shows up with real-world data (a diff containing HTML, a markdown
  snippet with a code block), not your first three hand-written test
  payloads.

- **A busy port must never crash the flow.** Hardcoding port 8888 and letting
  `EADDRINUSE` bubble up kills the skill (and looks like a Claude Code bug to
  the user, not a port conflict). Retry a handful of nearby ports, then fall
  back to an OS-assigned ephemeral port (`listen(0, ...)`), and **always print
  the actual URL you bound to** — don't assume the caller knows the port.

- **A timeout must still emit valid output.** If the local server just exits
  silently after 2 hours of no response, and `SKILL.md` promised "prints one
  JSON line to stdout", Claude is left parsing an empty string and the whole
  skill contract is violated. Print `{ "type": "timeout" }` before exiting so
  the caller can branch on it like any other outcome.

- **Auth the local server, even though it's bound to `127.0.0.1`.** A
  same-machine bind is not enough: any other tab open in the user's browser
  could `fetch('http://127.0.0.1:8888/submit', {method:'POST', ...})` and
  have Claude treat forged content as the user's real answer, or silently
  `/cancel` a flow the user is mid-way through. Two independent checks, both
  required:
  - A random per-run token baked into the opened URL (`?t=...`); every
    request must echo it or get 403. Generated fresh per process
    (`randomBytes`), never reused across runs.
  - A `Host` header check restricted to `127.0.0.1`/`localhost`/`[::1]` — this
    is what stops DNS-rebinding attacks, where a malicious page's origin
    resolves to `127.0.0.1` on a subsequent DNS lookup after passing an
    initial same-origin check.
  Neither check alone is sufficient; the token stops same-machine/same-browser
  forgery, the Host check stops DNS rebinding.

- **A page reload must not be indistinguishable from closing the tab.**
  `pagehide` fires on both a reload and an actual tab close, and the simplest
  implementation (`sendBeacon('/cancel')` on `pagehide`) cancels the flow on
  every accidental Cmd+R, which is infuriating mid-review. Fix: hold the
  `/cancel` beacon for a short grace period (~2.5s); if a `GET /` arrives
  before the grace period elapses, it's a reload — clear the pending cancel
  and keep going. The explicit **Cancel** button bypasses the grace period
  entirely (`/cancel?now=1`) so a deliberate cancel is still instant.

- **`hasChanges()` is the seam that drives the primary button, and it's a
  per-step contract, not shared code.** The shared shell doesn't know what
  "changed" means for a plan-review page vs. a diff-review page vs. a
  drag-and-drop chunk graph; each step defines its own `hasChanges()` in its
  `clientJs`, and the shell just calls it to flip the button label between
  idle ("Accept") and changed ("Send review"). Forgetting to define it isn't
  a hard error (the shared JS treats a missing function as "no changes"), but
  it silently breaks the review-loop UX — the button never says "Send
  review" even when the user typed something.

- **Never write payloads to `/tmp` or any temp file.** Pipe them via a
  heredoc on stdin instead. This isn't just tidiness — a temp file is a
  second place secrets/diffs sit on disk with a predictable name and no
  cleanup guarantee if the process is killed mid-flow.

- **`mdToHtml()` must allow-list link protocols.** A dependency-free markdown
  renderer that linkifies `[text](url)` without checking the scheme will
  happily turn `[click me](javascript:alert(1))` into a clickable XSS
  payload if any rendered content is ever attacker- or user-influenced (chunk
  descriptions, plan text, review comments all qualify). Restrict to
  `https?:`, `mailto:`, and relative/`#` targets; anything else stays as
  literal text.

- **Never build `on*="..."` attribute strings from data.** Wire all
  event handlers with `addEventListener` (or `el.onclick = fn`) using closures
  over real values, not by string-concatenating an inline handler
  (`'<div onclick="select(\'' + name + '\')">'`). A name/slug containing a
  quote or backslash breaks out of the attribute and injects arbitrary
  markup/script. This matters most for any field a *human typed* (a chunk
  name, a filename, a free-text comment) rather than one you generated
  yourself.

- **Keep the shared engine dependency-free (Node built-ins only).** No
  `npm install` step means the plugin works the instant it's cloned or
  dropped into a skills directory, with no lockfile drift, no `node_modules`
  to `.gitignore`, and no supply-chain surface. Worth the discipline of
  hand-rolling a ~40-line markdown renderer instead of pulling in `marked`.

- **The "sync into every skill folder" step needs a drift test, or it *will*
  drift.** It's tempting to hand-edit a bundled `skills/<name>/lib/server.mjs`
  for a quick fix and forget to backport it to the root `lib/`. A one-line
  `node:test` that byte-compares every bundled copy against its source (see
  §2.3) turns that into a loud CI failure instead of a silent, slowly
  diverging fork.

- **LLM-driven actions that a static page can't do (e.g. semantically
  splitting or merging structured content) still go through the same
  request/response round-trip** — the browser `POST`s a "please split X"
  request to `/submit` just like a normal accept, Claude does the actual
  reasoning/file-rewriting server-side, then re-invokes the skill to reopen
  the UI with fresh data. Don't try to implement anything LLM-shaped in the
  browser JS itself; the browser can only collect structured intent.

- **Env vars for every knob, with the plugin name as prefix** (`APP_PORT`,
  `APP_NO_OPEN`, `APP_CANCEL_GRACE_MS` in this doc — `ITERATOR_*` in the
  source plugin) — makes CI and sandboxed/remote sessions trivial to support
  (`APP_NO_OPEN=1` prints the URL instead of exec-ing a browser opener that
  will fail headless) without touching code.

---

## 4. Bootstrap checklist

1. `plugin.json` + `marketplace.json` with your plugin's name/description.
2. `lib/server.mjs` + `lib/ui.mjs` — copy §2.1 verbatim, replace `<APP>` and
   the env var prefix.
3. For your first interactive step: `skills/<APP>-<step>/SKILL.md`
   (frontmatter + numbered steps + exact payload/output shapes) and
   `skills/<APP>-<step>/server.mjs` (§2.2 template).
4. If a second step will share the shell, add `scripts/sync.mjs` (§2.3), run
   it, and add the drift test.
5. `test/server.test.mjs` with at minimum the 5 cases in §2.4 — write these
   before you consider the step "done", not after.
6. `package.json` scripts: `"test": "node --test"`, `"sync": "node
   scripts/sync.mjs"` if applicable, plus one `preview:<step>` script per step
   (`echo '<sample payload>' | node skills/<step>/server.mjs`) so you can
   eyeball the UI without going through Claude at all.
7. Dev loop: `claude --plugin-dir .` in this repo, then invoke
   `/<APP>-<step>` in any git repo to exercise the real thing end-to-end.
