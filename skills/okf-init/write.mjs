#!/usr/bin/env node
/**
 * okf-memory deterministic bundle writer — shared by okf-init,
 * okf-consolidate, and okf-memorize (as `../okf-init/write.mjs`).
 *
 * The review server's output plus the original draft cards pipe in verbatim;
 * every mechanical consequence of the user's verdicts happens here, never in
 * the model:
 *
 *   node <skill-dir>/write.mjs [project-root] << 'OKF_APPLY'
 *   {
 *     "op": "apply-review",
 *     "mode": "init" | "consolidate" | "memorize",
 *     "headCommit": "<sha>",                    // advances last_memorized_commit
 *     "memories":  [ ...the draft cards sent to the server... ],
 *     "decisions": [ { "id", "verdict" } ]      // the server's review-approved output
 *   }
 *   OKF_APPLY
 *
 * Verdicts: accept → write the proposed concept (or delete it when the card's
 * action is "delete"); keep/reject → leave disk unchanged; delete → remove the
 * existing concept file. Afterwards: regenerate touched area indexes
 * (preserving their heading/prose), preserve the root index (add missing area
 * links, set `last_memorized_commit` when headCommit is given, never remove
 * foreign keys or links), append newest-first `memory/log.md` entries, and run
 * the package validator when available. Prints exactly one JSON result line;
 * on validation/op errors prints {"ok":false,...} and exits 1.
 */
import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AREAS = {
	architecture: ["Architecture", "How the system is structured."],
	decisions: ["Decisions", "Durable product and implementation choices agents should preserve."],
	patterns: ["Patterns & Conventions", "How code and workflows are written in this repo."],
	pitfalls: ["Pitfalls", "Known bugs, portability hazards, and sharp edges."],
	setup: ["Setup", "Commands, install flows, and the development loop."],
};

const nowIso = () => process.env.OKF_NOW || new Date().toISOString();
const today = () => nowIso().slice(0, 10);
const fail = (msg) => {
	throw new Error(msg);
};

function gitRoot(cwd) {
	try {
		return execFileSync("git", ["rev-parse", "--show-toplevel"], {
			cwd,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return cwd;
	}
}

/** Split a document into its raw frontmatter block and body. */
function splitDoc(raw) {
	if (raw.startsWith("---\n")) {
		const end = raw.indexOf("\n---", 4);
		if (end !== -1) {
			const nl = raw.indexOf("\n", end + 4);
			return { fm: raw.slice(4, end), body: nl === -1 ? "" : raw.slice(nl + 1) };
		}
	}
	return { fm: null, body: raw };
}

/** Parse a frontmatter block into { key: scalar | [items] } (lossy is fine). */
function parseFm(fm) {
	const obj = {};
	let key = null;
	for (const line of (fm || "").split("\n")) {
		const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
		if (kv) {
			key = kv[1];
			obj[key] = kv[2].trim() === "" ? [] : kv[2].trim();
		} else if (key) {
			const item = line.match(/^\s+-\s+(.*)$/);
			if (item) {
				if (!Array.isArray(obj[key])) obj[key] = [];
				obj[key].push(item[1].trim());
			}
		}
	}
	return obj;
}

const listy = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const unquote = (s) =>
	/^".*"$/.test(s) || /^'.*'$/.test(s) ? s.slice(1, -1) : s;

function fmValue(key, value) {
	if (Array.isArray(value)) {
		if (!value.length) return null;
		return `${key}:\n${value.map((v) => `  - ${v}`).join("\n")}`;
	}
	const s = String(value).replace(/\s+/g, " ").trim();
	// ISO timestamps/dates stay bare (house style); other ':'-bearing scalars quote.
	const bare = /^[0-9][0-9T:.Z+-]*$/.test(s) || !/[:#[\]{}"'`|>&*!%@\n]/.test(s);
	return `${key}: ${bare ? s : JSON.stringify(s)}`;
}

/** Build a concept document from a draft card, carrying over unknown keys. */
function conceptDoc(card, existingRaw) {
	const prev = existingRaw ? parseFm(splitDoc(existingRaw).fm || "") : {};
	const ORDER = ["type", "title", "description", "status", "date", "tags", "files"];
	const merged = { ...prev };
	for (const k of ORDER) if (card[k] != null && card[k] !== "") merged[k] = card[k];
	merged.timestamp = nowIso();
	const keys = [
		...ORDER.filter((k) => merged[k] != null && merged[k] !== ""),
		"timestamp",
		...Object.keys(merged).filter((k) => !ORDER.includes(k) && k !== "timestamp"),
	];
	const fm = keys
		.map((k) => fmValue(k, merged[k]))
		.filter(Boolean)
		.join("\n");
	const body =
		card.body != null && card.body !== ""
			? String(card.body).trim()
			: (existingRaw ? splitDoc(existingRaw).body.trim() : "");
	return `---\n${fm}\n---\n\n${body}\n`;
}

/** Rebuild an area index's bullet list, preserving its heading and prose. */
function regenerateAreaIndex(mem, area) {
	const dir = join(mem, area);
	if (!existsSync(dir)) return;
	const entries = readdirSync(dir)
		.filter((f) => f.endsWith(".md") && f !== "index.md")
		.map((f) => {
			const fm = parseFm(splitDoc(readFileSync(join(dir, f), "utf8")).fm || "");
			return {
				slug: f.slice(0, -3),
				title: unquote(String(fm.title || f.slice(0, -3))),
				description: unquote(String(fm.description || "")),
			};
		})
		.sort((a, b) => a.title.localeCompare(b.title));
	const indexFile = join(dir, "index.md");
	const [title, desc] = AREAS[area] || [area, ""];
	let head = `# ${title}\n\n${desc}\n`;
	if (existsSync(indexFile)) {
		const lines = readFileSync(indexFile, "utf8").split("\n");
		const i = lines.findIndex((l) => /^\s*[*-]\s+\[/.test(l));
		head = (i === -1 ? lines.join("\n") : lines.slice(0, i).join("\n")).replace(/\s*$/, "\n");
	}
	const bullets = entries.map(
		(e) => `* [${e.title}](/${area}/${e.slug}.md) - ${e.description}`,
	);
	writeFileSync(indexFile, `${head}\n${bullets.join("\n")}\n`.replace(/\n{3,}/g, "\n\n"));
}

/** Preserve the root index; add missing area links; set the pointer. */
function updateRootIndex(mem, touchedAreas, headCommit) {
	const indexFile = join(mem, "index.md");
	let raw = existsSync(indexFile)
		? readFileSync(indexFile, "utf8")
		: `---\nokf_version: "0.1"\n---\n\n# Project Memory\n\nAgent-curated knowledge for this repository.\n\n# Areas\n`;
	const doc = splitDoc(raw);
	let fm = doc.fm ?? 'okf_version: "0.1"';
	if (headCommit) {
		fm = /^last_memorized_commit:/m.test(fm)
			? fm.replace(/^last_memorized_commit:.*$/m, `last_memorized_commit: ${headCommit}`)
			: `${fm.replace(/\s*$/, "")}\nlast_memorized_commit: ${headCommit}`;
	}
	const lines = doc.body.split("\n");
	const missing = [];
	for (const area of touchedAreas) {
		if (!existsSync(join(mem, area))) continue;
		const re = new RegExp(`\\]\\(/?${area}/\\)`);
		if (!lines.some((l) => /^\s*[*-]\s+\[/.test(l) && re.test(l))) {
			const [title, desc] = AREAS[area] || [area, ""];
			missing.push(`* [${title}](/${area}/) - ${desc}`);
		}
	}
	if (missing.length) {
		let last = -1;
		for (let i = lines.length - 1; i >= 0; i--) {
			if (/^\s*[*-]\s+\[/.test(lines[i])) {
				last = i;
				break;
			}
		}
		if (last === -1) lines.push("", ...missing);
		else lines.splice(last + 1, 0, ...missing);
	}
	const body = lines.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\s*$/, "\n");
	writeFileSync(indexFile, `---\n${fm}\n---\n${body}`);
}

/** Prepend log entries under today's `## date` heading (newest first). */
function prependLog(mem, entries) {
	if (!entries.length) return;
	const file = join(mem, "log.md");
	const day = `## ${today()}`;
	let text = existsSync(file) ? readFileSync(file, "utf8") : "# Memory Update Log\n";
	const bullets = entries.map((e) => `* ${e}`).join("\n");
	if (text.includes(`${day}\n`)) {
		text = text.replace(`${day}\n`, `${day}\n${bullets}\n`);
	} else {
		const lines = text.split("\n");
		const i = lines.findIndex((l) => l.startsWith("# "));
		lines.splice(i + 1, 0, "", day, bullets);
		text = lines.join("\n");
	}
	writeFileSync(file, text.replace(/\n{3,}/g, "\n\n"));
}

export function applyReview(payload, startDir) {
	const root = gitRoot(startDir || process.cwd());
	const bundle = String(payload.bundlePath || "memory/").replace(/\/+$/, "");
	const mem = join(root, bundle);
	const mode = payload.mode || "memorize";
	const cards = new Map(listy(payload.memories).map((m) => [m.id, m]));
	const decisions = listy(payload.decisions);
	if (!decisions.length) fail("apply-review needs decisions (the review-approved output)");

	// Validate before writing anything.
	for (const d of decisions) {
		if (!["accept", "reject", "keep", "delete"].includes(d.verdict)) {
			fail(`invalid verdict '${d.verdict}' for '${d.id}'`);
		}
		if (!/^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/i.test(String(d.id || ""))) {
			fail(`invalid concept id '${d.id || ""}' (expected <area>/<slug>)`);
		}
		const card = cards.get(d.id);
		if (d.verdict === "accept") {
			if (!card) fail(`decision '${d.id}' has no matching draft card`);
			if (card.action !== "delete" && !(card.type && card.title && card.description)) {
				fail(`card '${d.id}' needs type, title, description to be written`);
			}
		}
	}

	const written = [];
	const deleted = [];
	let kept = 0;
	let rejected = 0;
	const touched = new Set();
	const log = [];
	for (const d of decisions) {
		const card = cards.get(d.id) || { id: d.id };
		const file = join(mem, `${d.id}.md`);
		const area = d.id.split("/")[0];
		const ref = `[${card.title || d.id}](/${d.id}.md)`;
		if (d.verdict === "delete" || (d.verdict === "accept" && card.action === "delete")) {
			if (existsSync(file)) {
				rmSync(file);
				deleted.push(d.id);
				touched.add(area);
				log.push(`**Deletion**: Removed memory /${d.id}.md.`);
			}
		} else if (d.verdict === "accept") {
			const existing = existsSync(file) ? readFileSync(file, "utf8") : null;
			mkdirSync(dirname(file), { recursive: true });
			writeFileSync(file, conceptDoc(card, existing));
			written.push(d.id);
			touched.add(area);
			log.push(`**${existing ? "Update" : "Creation"}**: Memorized ${ref}.`);
		} else if (d.verdict === "keep") kept += 1;
		else rejected += 1;
	}

	for (const area of touched) regenerateAreaIndex(mem, area);
	mkdirSync(mem, { recursive: true });
	updateRootIndex(mem, touched, payload.headCommit || null);
	if (payload.headCommit) {
		log.push(
			`**${mode === "init" ? "Initialization" : "Memorize"}**: Set last_memorized_commit to ${String(payload.headCommit).slice(0, 12)}.`,
		);
	}
	prependLog(mem, log.reverse());

	// Package validator when available (repo checkout / installed plugin).
	let validation = null;
	const validator = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "scripts", "validate.mjs");
	if (existsSync(validator)) {
		try {
			const out = execFileSync(process.execPath, [validator, mem], {
				encoding: "utf8",
				stdio: ["ignore", "pipe", "pipe"],
			});
			validation = { ok: true, output: out.trim() };
		} catch (e) {
			validation = { ok: false, output: String(e.stdout || e.stderr || e.message).trim() };
		}
	}

	return {
		op: "apply-review",
		mode,
		written,
		deleted,
		kept,
		rejected,
		advancedTo: payload.headCommit || null,
		validation,
	};
}

function readStdin() {
	return new Promise((resolve) => {
		let raw = "";
		process.stdin.setEncoding("utf8");
		process.stdin.on("data", (chunk) => (raw += chunk));
		process.stdin.on("end", () => resolve(raw));
		if (process.stdin.isTTY) resolve("");
	});
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const raw = await readStdin();
	let result;
	try {
		const payload = JSON.parse(raw || "{}");
		if (payload.op && payload.op !== "apply-review") fail(`unknown op '${payload.op}' (apply-review)`);
		result = { ok: true, ...applyReview(payload, process.argv[2]) };
	} catch (e) {
		process.stdout.write(JSON.stringify({ ok: false, error: e.message }) + "\n");
		process.exit(1);
	}
	process.stdout.write(JSON.stringify(result) + "\n");
}
