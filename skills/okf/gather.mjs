#!/usr/bin/env node
/**
 * okf-memory: deterministic state gathering for the dashboard.
 *
 * Prints the dashboard payload JSON to stdout so the SKILL.md pipes it
 * straight into server.mjs — the agent never re-implements this collection:
 *
 *   node <skill-dir>/gather.mjs [project-root] | node <skill-dir>/server.mjs
 *
 * Collects: memory bundle state (okf_version, last_memorized_commit, concept
 * count, stale file anchors, unmemorized commit count), the five knowledge
 * areas with per-area counts, and OKF plan/chunk concepts under memory/plans/.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const AREAS = [
	["architecture", "Architecture", "How the system is structured."],
	["decisions", "Decisions", "Durable product and implementation choices agents should preserve."],
	["patterns", "Patterns & Conventions", "How code and workflows are written in this repo."],
	["pitfalls", "Pitfalls", "Known bugs, portability hazards, and sharp edges."],
	["setup", "Setup", "Commands, install flows, and the development loop."],
];

function git(args, cwd) {
	try {
		return execFileSync("git", args, {
			cwd,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return "";
	}
}

/** Minimal frontmatter parser: scalars (optionally quoted) and block lists. */
export function frontmatter(text) {
	if (!text.startsWith("---\n")) return { fm: {}, body: text };
	const end = text.indexOf("\n---", 4);
	if (end === -1) return { fm: {}, body: text };
	const body = text.slice(end + 4).replace(/^\n+/, "");
	const unquote = (s) =>
		/^".*"$/.test(s) || /^'.*'$/.test(s) ? s.slice(1, -1) : s;
	const fm = {};
	let key = null;
	for (const line of text.slice(4, end).split("\n")) {
		const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
		if (kv) {
			key = kv[1];
			const val = kv[2].trim();
			if (val === "") fm[key] = null;
			else if (val.startsWith("[") && val.endsWith("]")) {
				fm[key] = val
					.slice(1, -1)
					.split(",")
					.map((s) => unquote(s.trim()))
					.filter(Boolean);
			} else fm[key] = unquote(val);
		} else if (key) {
			const item = line.match(/^\s+-\s+(.*)$/);
			if (item) {
				if (!Array.isArray(fm[key])) fm[key] = [];
				fm[key].push(unquote(item[1].trim()));
			}
		}
	}
	return { fm, body };
}

function mdFilesUnder(dir) {
	const out = [];
	if (!existsSync(dir)) return out;
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) out.push(...mdFilesUnder(p));
		else if (name.endsWith(".md") && name !== "index.md" && name !== "log.md")
			out.push(p);
	}
	return out;
}

export function gather(startDir) {
	const cwd = startDir || process.cwd();
	const root = git(["rev-parse", "--show-toplevel"], cwd) || cwd;
	const mem = join(root, "memory");

	const idx = join(mem, "index.md");
	const initialized = existsSync(idx);
	let okfVersion = null;
	let lastCommit = null;
	if (initialized) {
		const { fm } = frontmatter(readFileSync(idx, "utf8"));
		okfVersion = fm.okf_version ?? null;
		lastCommit = fm.last_memorized_commit ?? null;
	}

	const conceptFiles = mdFilesUnder(mem);

	const tracked = new Set(git(["ls-files"], root).split("\n").filter(Boolean));
	let stale = 0;
	if (tracked.size) {
		for (const p of conceptFiles) {
			let fm;
			try {
				fm = frontmatter(readFileSync(p, "utf8")).fm;
			} catch {
				continue;
			}
			let files = fm.files ?? [];
			if (typeof files === "string") files = [files];
			if (Array.isArray(files) && files.some((f) => f && !tracked.has(f)))
				stale += 1;
		}
	}

	let unmemorized = "?";
	if (lastCommit) {
		if (git(["rev-parse", "--verify", `${lastCommit}^{commit}`], root)) {
			const out = git(["log", "--oneline", `${lastCommit}..HEAD`], root);
			unmemorized = out ? out.split("\n").filter(Boolean).length : 0;
		}
	}

	const areas = AREAS.map(([id, title, description]) => ({
		id,
		title,
		description,
		count: mdFilesUnder(join(mem, id)).length,
	}));

	const plans = [];
	const chunks = [];
	const plansRoot = join(mem, "plans");
	for (const p of mdFilesUnder(plansRoot)) {
		const { fm, body } = frontmatter(readFileSync(p, "utf8"));
		const type = String(fm.type || "").toLowerCase();
		const rel = relative(mem, p).replace(/\.md$/, "").split("\\").join("/");
		if (type === "plan") {
			plans.push({
				id: rel,
				title: fm.title || rel,
				description: fm.description || "",
				status: fm.status || "",
				chunks: [],
			});
		} else if (type === "work chunk" || type === "chunk") {
			let depends = fm.depends_on ?? [];
			let files = fm.files ?? [];
			if (typeof depends === "string") depends = [depends];
			if (typeof files === "string") files = [files];
			chunks.push({
				id: rel,
				planId: fm.plan || rel.split("/").slice(0, -1).join("/"),
				title: fm.title || rel,
				description: fm.description || "",
				status: fm.status || "",
				dependsOn: Array.isArray(depends) ? depends : [],
				files: Array.isArray(files) ? files : [],
				body,
			});
		}
	}
	const byId = new Map(plans.map((p) => [p.id, p]));
	for (const c of chunks) {
		if (byId.has(c.planId)) byId.get(c.planId).chunks.push(c.id);
	}

	return {
		project: root,
		bundlePath: "memory/",
		memory: {
			initialized,
			okfVersion,
			lastMemorizedCommit: lastCommit,
			conceptCount: conceptFiles.length,
			staleCount: stale,
			unmemorizedCommitCount: unmemorized,
		},
		areas,
		plans,
		chunks,
	};
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	process.stdout.write(JSON.stringify(gather(process.argv[2])) + "\n");
}
