#!/usr/bin/env node
/**
 * okf-memory dashboard server — project memory plane.
 *
 * input (stdin JSON):
 *   {
 *     project, bundlePath, round,
 *     memory: { initialized, okfVersion?, lastMemorizedCommit?, conceptCount?, staleCount?, unmemorizedCommitCount? },
 *     areas: [{ id, title, description, count }],
 *     plans: [{ id, title, description, status, chunks: [chunkId] }],
 *     chunks: [{ id, planId, title, description, status, dependsOn, files, body }]
 *   }
 *
 * output (exactly one JSON line on stdout):
 *   { type: "dashboard-action", action, target?, prompt? }
 *   { type: "cancel" } | { type: "timeout" }
 */
import { readPayload, serve } from "./lib/server.mjs";
import { renderPage, escHtml } from "./lib/ui.mjs";

const data = await readPayload();
const memory =
	data.memory && typeof data.memory === "object" ? data.memory : {};
const areas = Array.isArray(data.areas) ? data.areas : [];
const plans = Array.isArray(data.plans) ? data.plans : [];
const chunks = Array.isArray(data.chunks) ? data.chunks : [];

const statusClass = (status = "") =>
	String(status || "unknown")
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, "-");

function statusChip(status) {
	const s = status || "unknown";
	return `<span class="status ${escHtml(statusClass(s))}">${escHtml(s)}</span>`;
}

function memoryStatus() {
	const initialized = Boolean(memory.initialized);
	const commit = memory.lastMemorizedCommit
		? String(memory.lastMemorizedCommit).slice(0, 12)
		: "not set";
	return `<section class="panel hero">
  <div>
    <h2>Memory status</h2>
    <p>${initialized ? "This project has an OKF memory bundle." : "No OKF memory bundle detected yet."}</p>
  </div>
  <div class="metrics">
    <div><strong>${initialized ? "Initialized" : "Missing"}</strong><span>state</span></div>
    <div><strong>${escHtml(memory.conceptCount ?? 0)}</strong><span>concepts</span></div>
    <div><strong>${escHtml(memory.staleCount ?? 0)}</strong><span>stale</span></div>
    <div><strong>${escHtml(memory.unmemorizedCommitCount ?? "?")}</strong><span>new commits</span></div>
    <div><strong>${escHtml(commit)}</strong><span>last memorized</span></div>
  </div>
  <div class="actions">
    <button data-action="init">Initialize</button>
    <button data-action="consolidate">Consolidate</button>
    <button data-action="memorize">Memorize commits</button>
  </div>
</section>`;
}

function areaCards() {
	const fallback = [
		["architecture", "Architecture", "How the system is structured"],
		["decisions", "Decisions", "Why important choices were made"],
		["patterns", "Patterns & Conventions", "How code here is written"],
		["pitfalls", "Pitfalls", "Known bugs and sharp edges"],
		["setup", "Setup", "Build, test, and run commands"],
	];
	const shown = areas.length
		? areas
		: fallback.map(([id, title, description]) => ({
				id,
				title,
				description,
				count: 0,
			}));
	return `<section class="panel"><h2>Knowledge areas</h2><div class="grid areas">
${shown
	.map(
		(a) => `<article class="tile">
  <h3>${escHtml(a.title || a.id)}</h3>
  <p>${escHtml(a.description || "")}</p>
  <div class="tile-foot"><span>${escHtml(a.count ?? 0)} memories</span><button data-action="draft-memory" data-target="${escHtml(a.id)}">Add memory</button></div>
</article>`,
	)
	.join("\n")}
</div></section>`;
}

function chunkCard(c) {
	const deps =
		Array.isArray(c.dependsOn) && c.dependsOn.length
			? c.dependsOn.map((d) => `<code>${escHtml(d)}</code>`).join(" ")
			: '<span class="muted">none</span>';
	const files =
		Array.isArray(c.files) && c.files.length
			? c.files.map((f) => `<code>${escHtml(f)}</code>`).join(" ")
			: '<span class="muted">none</span>';
	return `<article class="chunk" data-id="${escHtml(c.id)}">
  <div class="card-head"><h4>${escHtml(c.title || c.id)}</h4>${statusChip(c.status)}</div>
  <p>${escHtml(c.description || "")}</p>
  <div class="meta"><span>depends on: ${deps}</span></div>
  <div class="meta"><span>files: ${files}</span></div>
  <div class="chunk-actions">
    <button data-action="implement" data-target="${escHtml(c.id)}">Implement</button>
    <button data-action="test" data-target="${escHtml(c.id)}">Test</button>
    <button data-action="mark-done" data-target="${escHtml(c.id)}">Mark done</button>
  </div>
</article>`;
}

function planSections() {
	const chunksByPlan = new Map();
	for (const c of chunks) {
		const key = c.planId || "unassigned";
		if (!chunksByPlan.has(key)) chunksByPlan.set(key, []);
		chunksByPlan.get(key).push(c);
	}
	let planHtml =
		'<p class="muted">No OKF plan files found under memory/plans/.</p>';
	if (plans.length) {
		planHtml = plans
			.map((p) => {
				const ownChunks = chunksByPlan.get(p.id) || [];
				let chunkHtml = '<p class="muted">No chunks yet.</p>';
				if (ownChunks.length) chunkHtml = ownChunks.map(chunkCard).join("\n");
				return `<article class="plan">
  <div class="card-head"><h3>${escHtml(p.title || p.id)}</h3>${statusChip(p.status)}</div>
  <p>${escHtml(p.description || "")}</p>
  <div class="plan-actions"><button data-action="create-chunk" data-target="${escHtml(p.id)}">Add chunk</button></div>
  <div class="chunks">${chunkHtml}</div>
</article>`;
			})
			.join("\n");
	}
	const unassigned = chunksByPlan.get("unassigned") || [];
	return `<section class="panel">
  <div class="section-head"><h2>Plans and chunks</h2><button data-action="create-plan">Create plan</button></div>
  <p class="hint">Each plan and each chunk should be a separate OKF markdown file so status, dependencies, files, and rationale stay human-readable.</p>
  ${planHtml}
  ${unassigned.length ? `<article class="plan"><h3>Unassigned chunks</h3>${unassigned.map(chunkCard).join("\n")}</article>` : ""}
</section>`;
}

const CSS = `
.panel{border:1px solid var(--border);border-radius:10px;background:var(--card);padding:16px;margin:0 0 18px}
.hero{display:grid;gap:14px}.hero h2,.panel h2{font-size:18px;margin:0 0 4px}.hero p,.hint,.muted{color:var(--muted)}
.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px}.metrics div{border:1px solid var(--border);border-radius:8px;padding:10px;background:var(--bg)}.metrics strong{display:block;font-size:17px}.metrics span{font-size:12px;color:var(--muted)}
.actions,.chunk-actions,.plan-actions,.tile-foot,.section-head{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.section-head{justify-content:space-between}.actions button,.chunk-actions button,.plan-actions button,.tile-foot button,.section-head button{font-size:13px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.tile,.plan,.chunk{border:1px solid var(--border);border-radius:8px;background:var(--bg);padding:12px}.tile h3,.plan h3,.chunk h4{margin:0;font-size:15px}.tile p,.plan p,.chunk p{color:var(--muted);font-size:13px;margin:5px 0}.tile-foot{justify-content:space-between;margin-top:10px;color:var(--muted);font-size:12px}
.plan{margin-top:12px}.chunks{display:grid;gap:10px;margin-top:10px}.card-head{display:flex;align-items:center;gap:8px;justify-content:space-between}.status{font-size:10px;text-transform:uppercase;border-radius:12px;padding:2px 8px;border:1px solid var(--border);color:var(--muted)}.status.done,.status.tested{color:var(--green);border-color:var(--green)}.status.in-progress{color:var(--blue);border-color:var(--blue)}.status.blocked{color:var(--red);border-color:var(--red)}.status.pending{color:var(--amber);border-color:var(--amber)}
.meta{font-size:12px;color:var(--muted);margin:5px 0}.meta code{font-size:11px;margin-right:4px}.request-box{display:grid;gap:8px}.request-box textarea{width:100%;min-height:80px;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:6px;padding:8px;font:inherit}
`;

const BODY = `
${memoryStatus()}
${areaCards()}
${planSections()}
<section class="panel request-box">
  <h2>Ask the agent to add memory</h2>
  <p class="hint">Describe the architecture, decision, pattern, pitfall, or setup fact you want researched. The dashboard returns this request to the coding agent; the agent drafts a normal review card for accept/revise/delete.</p>
  <textarea id="memory-prompt" placeholder="Example: Capture how the review server binds ports and why token checks matter."></textarea>
  <div><button data-action="draft-memory-prompt">Draft memory from prompt</button></div>
</section>`;

const JS = `
function hasChanges() { return false; }
function onPrimary() { post({ type: 'dashboard-action', action: 'close' }, 'Closed'); }
function sendAction(action, target, prompt) {
  post({ type: 'dashboard-action', action: action, target: target || null, prompt: prompt || '' }, 'Action sent');
}
function onReady() {
  document.querySelectorAll('[data-action]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var action = btn.dataset.action;
      var prompt = '';
      if (action === 'draft-memory-prompt') prompt = document.getElementById('memory-prompt').value.trim();
      sendAction(action, btn.dataset.target || null, prompt);
    });
  });
}
`;

const subtitle = [data.project, data.bundlePath || "memory/"]
	.filter(Boolean)
	.join(" · ");
const html = renderPage({
	step: "dashboard",
	title: "okf-memory — project memory plane",
	subtitle,
	data: { memory, areas, plans, chunks },
	css: CSS,
	body: BODY,
	clientJs: JS,
	primaryIdle: "Close",
	primaryChanged: "Close",
});

serve({ step: "dashboard", html });
