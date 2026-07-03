#!/usr/bin/env node
/**
 * okf-memory review server — shared by okf-init, okf-consolidate, okf-memorize.
 *
 * input (stdin JSON):
 *   {
 *     mode: "init" | "consolidate" | "memorize",
 *     project, bundlePath, round,
 *     baseCommit?, headCommit?, commitCount?,        // memorize only
 *     areas:    [{ id, title, description }],
 *     memories: [{
 *       id, area, action: "create"|"update"|"delete"|"keep",
 *       type, title, description, tags, files,
 *       body, existingBody?, stale?, staleReasons?,
 *       conflict?: { with, summary }, sourceCommits?
 *     }]
 *   }
 *
 * output (exactly one JSON line on stdout):
 *   { type: "review-approved", mode, decisions: [{ id, verdict }] }
 *   { type: "review-feedback", mode, decisions, comments: [{ id, comment }], general }
 *   { type: "cancel" } | { type: "timeout" }
 *
 * verdicts: accept (write the proposed body) | reject (discard the proposal,
 * change nothing) | keep (leave the existing file untouched) | delete (remove
 * the existing concept file).
 */
import { readPayload, serve } from "./lib/server.mjs";
import { renderPage, escHtml } from "./lib/ui.mjs";

const data = await readPayload();
const mode = ["init", "consolidate", "memorize"].includes(data.mode)
	? data.mode
	: "init";
const areas = Array.isArray(data.areas) ? data.areas : [];
const memories = Array.isArray(data.memories) ? data.memories : [];
const round = data.round || 1;

const staleCount = memories.filter((m) => m.stale).length;
const conflictCount = memories.filter((m) => m.conflict).length;
const draftCount = memories.filter((m) => m.action !== "keep").length;

function banner() {
	if (mode === "init") {
		return `Drafted <strong>${memories.length}</strong> memories from codebase analysis — review, comment, accept.`;
	}
	if (mode === "consolidate") {
		return (
			`Reviewing <strong>${memories.length}</strong> existing memories` +
			(staleCount
				? ` — <span class="amber"><strong>${staleCount}</strong> stale</span>`
				: " — none stale") +
			"."
		);
	}
	const commitCount = Number(data.commitCount) || 0;
	const draftLabel = draftCount === 1 ? "draft" : "drafts";
	const commitLabel = commitCount === 1 ? "commit" : "commits";
	const conflictLabel = conflictCount === 1 ? "conflict" : "conflicts";
	const conflictHtml = conflictCount
		? ` — <span class="red"><strong>${conflictCount}</strong> ${conflictLabel}</span>`
		: " — no conflicts";
	return (
		`<strong>${draftCount}</strong> ${draftLabel} from ` +
		`<strong>${commitCount || "?"}</strong> ${commitLabel}` +
		conflictHtml +
		"."
	);
}

const ACTION_BADGE = {
	create: ["new", "NEW"],
	update: ["upd", "UPDATE"],
	delete: ["del", "DELETE"],
	keep: ["keep", "KEEP"],
};

function cardHtml(m) {
	const [cls, label] = ACTION_BADGE[m.action] || ACTION_BADGE.keep;
	const tags =
		Array.isArray(m.tags) && m.tags.length
			? " · " +
				m.tags.map((t) => `<span class="tag">${escHtml(t)}</span>`).join(" ")
			: "";
	const commits =
		Array.isArray(m.sourceCommits) && m.sourceCommits.length
			? ` · <span class="commits">${escHtml(m.sourceCommits.map((c) => String(c).slice(0, 7)).join(", "))}</span>`
			: "";
	const showExisting =
		m.existingBody !== null &&
		m.existingBody !== undefined &&
		["update", "delete", "keep"].includes(m.action);
	return `<article class="card" data-id="${escHtml(m.id)}">
  <div class="card-head">
    <span class="card-title">${escHtml(m.title || m.id)}</span>
    <span class="chip">${escHtml(m.type || "")}</span>
    <span class="badge ${cls}">${label}</span>
    ${m.stale ? '<span class="badge stale">STALE</span>' : ""}
    ${m.conflict ? `<button type="button" class="badge conflict conflict-btn" data-with="${escHtml(m.conflict.with || "")}">CONFLICT ⇄</button>` : ""}
  </div>
  <div class="meta"><code>${escHtml(m.id)}.md</code>${tags}${commits}</div>
  ${m.description ? `<div class="desc">${escHtml(m.description)}</div>` : ""}
  ${
		m.stale && Array.isArray(m.staleReasons) && m.staleReasons.length
			? `<div class="stale-panel">${m.staleReasons.map((r) => `<div>⚠ ${escHtml(r)}</div>`).join("")}</div>`
			: ""
	}
  ${
		m.conflict
			? `<div class="conflict-panel" hidden>Conflicts with <code>${escHtml(m.conflict.with || "")}</code> — ${escHtml(m.conflict.summary || "")}</div>`
			: ""
	}
  <div class="body md" data-body-id="${escHtml(m.id)}"></div>
  ${
		showExisting
			? `<details class="existing"><summary>Current version on disk</summary><div class="md" data-existing-id="${escHtml(m.id)}"></div></details>`
			: ""
	}
  <div class="controls">
    <div class="verdicts" data-id="${escHtml(m.id)}">${verdictButtons(m)}</div>
    <textarea class="comment" data-id="${escHtml(m.id)}" rows="1"
      placeholder="Comment — sends this memory back to Claude for revision"></textarea>
  </div>
</article>`;
}

function verdictButtons(m) {
	const btn = (verdict, label) =>
		`<button type="button" data-verdict="${verdict}">${label}</button>`;
	if (m.action === "keep") return btn("keep", "Keep") + btn("delete", "Delete");
	if (m.action === "delete")
		return btn("delete", "Delete") + btn("keep", "Keep");
	return btn("accept", "Accept") + btn("reject", "Reject");
}

function areaSections() {
	const byArea = new Map(areas.map((a) => [a.id, []]));
	const other = [];
	for (const m of memories) {
		(byArea.get(m.area) || other).push(m);
	}
	let html = "";
	for (const a of areas) {
		const cards = byArea.get(a.id);
		if (!cards.length && mode !== "init") continue;
		html += `<section class="area">
<h2>${escHtml(a.title || a.id)} <span class="count">${cards.length}</span></h2>
${a.description ? `<p class="area-desc">${escHtml(a.description)}</p>` : ""}
${cards.length ? cards.map(cardHtml).join("\n") : '<p class="empty">No memories drafted for this area.</p>'}
</section>`;
	}
	if (other.length) {
		html += `<section class="area"><h2>Other <span class="count">${other.length}</span></h2>
${other.map(cardHtml).join("\n")}</section>`;
	}
	return html;
}

const CSS = `
.banner{border:1px solid var(--border);border-left:4px solid var(--accent);border-radius:6px;
  background:var(--card);padding:10px 14px;margin-bottom:20px;font-size:14px}
.banner .red{color:var(--red)}
.banner .amber{color:var(--amber)}
.area h2{font-size:17px;margin:26px 0 4px}
.area h2 .count{color:var(--muted);font-weight:400;font-size:14px}
.area-desc{color:var(--muted);font-size:13px;margin-bottom:10px}
.empty{color:var(--muted);font-size:13px;font-style:italic;margin:8px 0}
.card{border:1px solid var(--border);border-radius:8px;background:var(--card);
  padding:12px 14px;margin:10px 0;transition:box-shadow .3s,border-color .3s}
.card.flash{border-color:var(--red);box-shadow:0 0 0 3px rgba(248,81,73,.3)}
.card-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.card-title{font-weight:600}
.chip{font-size:11px;border:1px solid var(--border);border-radius:10px;padding:1px 8px;color:var(--muted)}
.badge{font-size:10px;font-weight:700;letter-spacing:.5px;border-radius:4px;padding:2px 6px;border:none}
.badge.new{background:rgba(63,185,80,.2);color:var(--green)}
.badge.upd{background:rgba(88,166,255,.2);color:var(--blue)}
.badge.del{background:rgba(248,81,73,.2);color:var(--red)}
.badge.keep{background:var(--code-bg);color:var(--muted)}
.badge.stale{background:rgba(210,153,34,.2);color:var(--amber)}
.badge.conflict{background:var(--red);color:#fff;cursor:pointer}
.meta{font-size:12px;color:var(--muted);margin:4px 0}
.meta code{font-size:12px}
.tag{border:1px solid var(--border);border-radius:8px;padding:0 6px;font-size:11px}
.desc{font-size:13px;color:var(--muted);font-style:italic;margin:2px 0 6px}
.stale-panel{border-left:3px solid var(--amber);padding:4px 10px;margin:6px 0;font-size:13px;color:var(--amber)}
.conflict-panel{border-left:3px solid var(--red);padding:6px 10px;margin:6px 0;font-size:13px;color:var(--red)}
.body.md{border-top:1px solid var(--border);margin-top:8px;padding-top:4px;font-size:14px;overflow:hidden}
.body.md.collapsed{max-height:280px;-webkit-mask-image:linear-gradient(#000 75%,transparent);mask-image:linear-gradient(#000 75%,transparent)}
.show-more{display:block;margin:4px 0;font-size:12px;padding:2px 10px}
details.existing{margin:8px 0;font-size:14px}
details.existing summary{cursor:pointer;color:var(--muted);font-size:13px}
details.existing .md{border-left:3px solid var(--border);padding-left:10px;margin-top:6px;opacity:.8}
.controls{display:flex;gap:10px;align-items:flex-start;margin-top:10px}
.verdicts{display:flex;border:1px solid var(--border);border-radius:6px;overflow:hidden;flex-shrink:0}
.verdicts button{border:none;border-radius:0;background:transparent;font-size:13px;padding:4px 12px}
.verdicts button + button{border-left:1px solid var(--border)}
.verdicts button.sel[data-verdict="accept"],.verdicts button.sel[data-verdict="keep"]{background:var(--green);color:#fff}
.verdicts button.sel[data-verdict="reject"]{background:var(--muted);color:#fff}
.verdicts button.sel[data-verdict="delete"]{background:var(--red);color:#fff}
textarea.comment,#general-comment{flex:1;font:inherit;font-size:13px;background:var(--bg);color:var(--fg);
  border:1px solid var(--border);border-radius:6px;padding:6px 10px;resize:vertical;min-height:30px}
footer.general{margin:30px 0 60px}
footer.general label{display:block;font-weight:600;margin-bottom:6px}
#general-comment{width:100%;min-height:70px}
.hint{color:var(--muted);font-size:12px;margin-top:6px}
`;

const BODY = `
<div class="banner">${banner()}</div>
<div id="areas">
${areaSections()}
</div>
<footer class="general">
  <label for="general-comment">General comment</label>
  <textarea id="general-comment"
    placeholder="Anything about the memory set as a whole — missing topics, wrong emphasis, …"></textarea>
  <p class="hint">Any comment sends the review back to Claude for another round.
    With no comments, the header button accepts the verdicts as chosen above.</p>
</footer>`;

// Step client JS. No backticks / dollar-brace; data only via D.
const JS = `
var state = new Map();
D.memories.forEach(function (m) { state.set(m.id, { verdict: defaultVerdict(m), comment: '' }); });
function defaultVerdict(m) {
  if (m.action === 'delete') return 'delete';
  if (m.action === 'keep') return 'keep';
  return 'accept';
}
function hasChanges() {
  if (document.getElementById('general-comment').value.trim()) return true;
  var changed = false;
  state.forEach(function (s) { if (s.comment.trim()) changed = true; });
  return changed;
}
function onPrimary() {
  var decisions = [], comments = [];
  state.forEach(function (s, id) {
    decisions.push({ id: id, verdict: s.verdict });
    if (s.comment.trim()) comments.push({ id: id, comment: s.comment.trim() });
  });
  var general = document.getElementById('general-comment').value.trim();
  if (comments.length || general) {
    post({ type: 'review-feedback', mode: D.mode, decisions: decisions, comments: comments, general: general }, 'Feedback sent');
  } else {
    post({ type: 'review-approved', mode: D.mode, decisions: decisions }, 'Approved');
  }
}
function onReady() {
  D.memories.forEach(function (m) {
    var el = document.querySelector('[data-body-id="' + CSS.escape(m.id) + '"]');
    if (el) {
      var main = (m.action === 'keep' || m.body == null) ? (m.existingBody != null ? m.existingBody : m.body) : m.body;
      el.innerHTML = mdToHtml(main == null ? '' : main);
    }
    var ex = document.querySelector('[data-existing-id="' + CSS.escape(m.id) + '"]');
    if (ex) ex.innerHTML = mdToHtml(m.existingBody == null ? '' : m.existingBody);
  });
  document.querySelectorAll('.verdicts').forEach(function (group) {
    var buttons = group.querySelectorAll('button');
    buttons.forEach(function (btn, idx) {
      if (idx === 0) btn.classList.add('sel');
      btn.addEventListener('click', function () {
        state.get(group.dataset.id).verdict = btn.dataset.verdict;
        buttons.forEach(function (b) { b.classList.toggle('sel', b === btn); });
      });
    });
  });
  document.querySelectorAll('textarea.comment').forEach(function (t) {
    t.addEventListener('input', function () { state.get(t.dataset.id).comment = t.value; });
  });
  document.querySelectorAll('.conflict-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      var panel = b.closest('.card').querySelector('.conflict-panel');
      if (panel) panel.hidden = !panel.hidden;
      var target = document.querySelector('.card[data-id="' + CSS.escape(b.dataset.with) + '"]');
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.add('flash');
        setTimeout(function () { target.classList.remove('flash'); }, 1800);
      }
    });
  });
  document.querySelectorAll('.body.md').forEach(function (el) {
    if (el.scrollHeight > 320) {
      el.classList.add('collapsed');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'show-more';
      btn.textContent = 'Show more';
      btn.addEventListener('click', function () {
        var c = el.classList.toggle('collapsed');
        btn.textContent = c ? 'Show more' : 'Show less';
      });
      el.after(btn);
    }
  });
}
`;

const subtitleParts = [
	data.project,
	data.bundlePath || "memory/",
	`round ${round}`,
].filter(Boolean);
if (mode === "memorize" && data.baseCommit && data.headCommit) {
	subtitleParts.push(
		`${String(data.baseCommit).slice(0, 7)}..${String(data.headCommit).slice(0, 7)}`,
	);
}

const html = renderPage({
	step: mode,
	title: `okf-memory — ${mode} review`,
	subtitle: subtitleParts.join(" · "),
	data: { mode, memories, areas },
	css: CSS,
	body: BODY,
	clientJs: JS,
	primaryIdle: "Accept",
	primaryChanged: "Send review",
});

serve({ step: mode, html });
