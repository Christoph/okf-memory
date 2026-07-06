#!/usr/bin/env node
/**
 * Shared page shell for okf-memory review servers.
 *
 * Exports:
 *   escHtml(s)    — server-side HTML escaping for attributes/text.
 *   embed(obj)    — JSON.stringify with `<`, U+2028, U+2029 escaped so a
 *                   payload value can never terminate the inline <script>
 *                   block it is embedded in.
 *   renderPage()  — full HTML document: themed header (theme toggle, Cancel,
 *                   primary button), `const D = <embed(data)>`, shared client
 *                   JS, then the step's own clientJs.
 *   BASE_CSS      — theme variables, header, card-agnostic prose (.md) styles.
 *   DIFF_CSS      — shared unified-diff table style (unused by v1 steps).
 *
 * Client-side contract (per step, defined in clientJs):
 *   hasChanges()  — returns true iff the user changed something; flips the
 *                   primary button label between primaryIdle/primaryChanged.
 *                   A missing function is treated as "no changes".
 *   onPrimary()   — called when the primary button is clicked; must call
 *                   post(payload, okMsg).
 *   onReady()     — optional; called once after DOM + shared JS are wired.
 *
 * Shared client JS provides: __RUN (this round's id, echoed on /submit and
 * /cancel so stale tabs can't act on the live round), __api(path),
 * post(payload, okMsg), a pagehide cancel-beacon (server holds it for a grace
 * period so reloads don't cancel), cancelFlow() (explicit Cancel →
 * /cancel?now=1, immediate), toggleTheme(), esc(), and a dependency-free
 * mdToHtml() whose link targets are allow-listed to https?:|mailto:|[/.#].
 */
import { RUN_ID } from './server.mjs';

export function escHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function embed(obj) {
  return JSON.stringify(obj ?? null)
    .replaceAll('<', '\\u003c')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

export const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
:root,[data-theme="light"]{
  --bg:#ffffff;--fg:#1f2328;--muted:#57606a;--border:#d0d7de;--card:#f6f8fa;
  --accent:#0969da;--green:#1a7f37;--red:#cf222e;--amber:#9a6700;--blue:#0969da;
  --code-bg:#eff2f5;
}
[data-theme="dark"]{
  --bg:#0d1117;--fg:#e6edf3;--muted:#8b949e;--border:#30363d;--card:#161b22;
  --accent:#58a6ff;--green:#3fb950;--red:#f85149;--amber:#d29922;--blue:#58a6ff;
  --code-bg:#1c2129;
}
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--fg);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  font-size:15px;line-height:1.5}
header{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:space-between;
  gap:16px;padding:10px 20px;background:var(--bg);border-bottom:1px solid var(--border)}
header h1{font-size:16px;font-weight:600}
header .subtitle{font-size:12px;color:var(--muted)}
.hdr-right{display:flex;gap:8px;align-items:center}
button{font:inherit;cursor:pointer;border:1px solid var(--border);border-radius:6px;
  background:var(--card);color:var(--fg);padding:5px 12px}
button:disabled{opacity:.6;cursor:default}
#primary-btn{background:var(--green);border-color:var(--green);color:#fff;font-weight:600}
#cancel-btn:hover{border-color:var(--red);color:var(--red)}
main{max-width:960px;margin:0 auto;padding:20px}
.md h1,.md h2,.md h3,.md h4{margin:14px 0 6px;line-height:1.3}
.md h1{font-size:18px}.md h2{font-size:16px}.md h3{font-size:15px}
.md p{margin:6px 0}
.md ul,.md ol{margin:6px 0;padding-left:24px}
.md code{background:var(--code-bg);border-radius:4px;padding:1px 5px;font-size:13px;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.md pre{background:var(--code-bg);border-radius:6px;padding:10px;overflow-x:auto;margin:8px 0}
.md pre code{background:none;padding:0}
.md table{border-collapse:collapse;margin:8px 0}
.md th,.md td{border:1px solid var(--border);padding:4px 10px;text-align:left;font-size:14px}
.md th{background:var(--card)}
.md a{color:var(--accent)}
`;

export const DIFF_CSS = `
table.diff{border-collapse:collapse;width:100%;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}
table.diff td{padding:0 8px;white-space:pre-wrap;vertical-align:top}
table.diff .ln{color:var(--muted);text-align:right;user-select:none;width:1%}
table.diff .add{background:rgba(63,185,80,.15)}
table.diff .del{background:rgba(248,81,73,.15)}
`;

// Shared client-side JS. Kept free of backticks and dollar-brace sequences so
// it can live inside a template literal; user data only ever arrives via D.
const SHARED_JS = `
// __RUN is this round's id (embedded by renderPage); echoing it lets the
// server ignore /cancel-/submit beacons from tabs of an earlier round.
function __api(path) {
  return path + (path.indexOf('?') >= 0 ? '&' : '?') + 'r=' + __RUN;
}
var __done = false;
function __beacon() { if (!__done) navigator.sendBeacon(__api('/cancel'), ''); }
window.addEventListener('pagehide', __beacon);
function post(payload, okMsg) {
  if (__done) return;
  __done = true;
  var btn = document.getElementById('primary-btn');
  btn.disabled = true;
  btn.textContent = 'Sending…';
  fetch(__api('/submit'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(function (r) { return r.text(); }).then(function (html) {
    document.open(); document.write(html); document.close();
  }).catch(function () {
    __done = false;
    btn.disabled = false;
    btn.textContent = 'Retry — send failed';
  });
}
function cancelFlow() {
  if (__done) return;
  __done = true;
  fetch(__api('/cancel?now=1'), { method: 'POST' }).finally(function () {
    document.body.innerHTML = '<main><p style="color:var(--muted);padding:40px 0;text-align:center">' +
      'Review cancelled — nothing was written. You can close this tab.</p></main>';
  });
}
function toggleTheme() {
  var h = document.documentElement;
  h.dataset.theme = h.dataset.theme === 'dark' ? 'light' : 'dark';
}
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
// Dependency-free markdown: headings, ul/ol, fenced code, tables,
// bold/italic/inline-code, links (targets allow-listed — javascript: etc.
// stay literal text).
function mdToHtml(md) {
  function inline(s) {
    s = esc(s);
    s = s.replace(/\`([^\`]+)\`/g, function (_, c) { return '<code>' + c + '</code>'; });
    s = s.replace(/\\[([^\\]]*)\\]\\(([^)\\s]+)\\)/g, function (m, t, u) {
      return /^(https?:|mailto:|[\\/.#])/i.test(u)
        ? '<a href="' + u + '" rel="noopener">' + t + '</a>' : m;
    });
    s = s.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\\*([^*]+)\\*/g, '$1<em>$2</em>');
    return s;
  }
  var lines = String(md == null ? '' : md).replace(/\\r\\n/g, '\\n').split('\\n');
  var out = [], para = [], i = 0;
  function flush() {
    if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; }
  }
  while (i < lines.length) {
    var line = lines[i];
    if (/^\`\`\`/.test(line)) {
      flush();
      var buf = []; i++;
      while (i < lines.length && !/^\`\`\`/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push('<pre><code>' + esc(buf.join('\\n')) + '</code></pre>');
      continue;
    }
    var h = line.match(/^(#{1,6})\\s+(.*)$/);
    if (h) { flush(); var n = h[1].length; out.push('<h' + n + '>' + inline(h[2]) + '</h' + n + '>'); i++; continue; }
    if (/^\\s*[-*+]\\s+/.test(line)) {
      flush();
      var items = [];
      while (i < lines.length && /^\\s*[-*+]\\s+/.test(lines[i]))
        items.push('<li>' + inline(lines[i++].replace(/^\\s*[-*+]\\s+/, '')) + '</li>');
      out.push('<ul>' + items.join('') + '</ul>');
      continue;
    }
    if (/^\\s*\\d+[.)]\\s+/.test(line)) {
      flush();
      var oitems = [];
      while (i < lines.length && /^\\s*\\d+[.)]\\s+/.test(lines[i]))
        oitems.push('<li>' + inline(lines[i++].replace(/^\\s*\\d+[.)]\\s+/, '')) + '</li>');
      out.push('<ol>' + oitems.join('') + '</ol>');
      continue;
    }
    if (/^\\s*\\|/.test(line)) {
      flush();
      var rows = [];
      while (i < lines.length && /^\\s*\\|/.test(lines[i])) rows.push(lines[i++]);
      var html = '<table>';
      var first = true;
      for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        if (/^[\\s|:-]+$/.test(row)) continue; // separator row
        var tag = first ? 'th' : 'td';
        first = false;
        var cells = row.trim().replace(/^\\||\\|$/g, '').split('|');
        html += '<tr>' + cells.map(function (c) { return '<' + tag + '>' + inline(c.trim()) + '</' + tag + '>'; }).join('') + '</tr>';
      }
      out.push(html + '</table>');
      continue;
    }
    if (!line.trim()) { flush(); i++; continue; }
    para.push(line.trim()); i++;
  }
  flush();
  return out.join('\\n');
}
function __updatePrimary() {
  var btn = document.getElementById('primary-btn');
  if (btn.disabled) return;
  var changed = typeof hasChanges === 'function' && hasChanges();
  btn.textContent = changed ? __PRIMARY_CHANGED : __PRIMARY_IDLE;
}
function __init() {
  document.getElementById('theme-btn').addEventListener('click', toggleTheme);
  document.getElementById('cancel-btn').addEventListener('click', cancelFlow);
  document.getElementById('primary-btn').addEventListener('click', function () { onPrimary(); });
  document.addEventListener('input', __updatePrimary);
  document.addEventListener('change', __updatePrimary);
  if (typeof onReady === 'function') onReady();
  __updatePrimary();
}
`;

export function renderPage({
  step = 'review',
  title = '',
  subtitle = '',
  data = {},
  body = '',
  clientJs = '',
  css = '',
  primaryIdle = 'Accept',
  primaryChanged = 'Send review',
} = {}) {
  const heading = title || `okf-memory — ${step}`;
  return `<!DOCTYPE html>
<html data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(heading)}</title>
<style>${BASE_CSS}
${css}</style>
</head>
<body>
<header>
  <div class="hdr-left">
    <h1>${escHtml(heading)}</h1>
    <div class="subtitle">${escHtml(subtitle)}</div>
  </div>
  <div class="hdr-right">
    <button id="theme-btn" type="button" title="Toggle theme">◐</button>
    <button id="cancel-btn" type="button">Cancel</button>
    <button id="primary-btn" type="button">${escHtml(primaryIdle)}</button>
  </div>
</header>
<main>
${body}
</main>
<script>
const D = ${embed(data)};
const __RUN = ${embed(RUN_ID)};
const __PRIMARY_IDLE = ${embed(primaryIdle)};
const __PRIMARY_CHANGED = ${embed(primaryChanged)};
${SHARED_JS}
</script>
<script>
${clientJs}
</script>
<script>__init();</script>
</body>
</html>`;
}
