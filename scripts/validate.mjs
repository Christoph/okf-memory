#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const RESERVED = new Set(["index", "log"]);

function parseScalar(raw) {
	const value = raw.trim();
	if (!value) return "";
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1);
	}
	if (value === "[]") return [];
	if (value.startsWith("[") && value.endsWith("]")) {
		return value
			.slice(1, -1)
			.split(",")
			.map((s) => parseScalar(s))
			.filter(Boolean);
	}
	return value;
}

export function parseFrontmatter(text) {
	if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) return null;
	const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (!match) throw new Error("frontmatter is not closed with ---");
	const obj = {};
	const lines = match[1].split(/\r?\n/);
	let currentKey = null;
	for (const line of lines) {
		if (!line.trim() || line.trimStart().startsWith("#")) continue;
		const list = line.match(/^\s*-\s+(.*)$/);
		if (list && currentKey) {
			if (!Array.isArray(obj[currentKey])) obj[currentKey] = [];
			obj[currentKey].push(parseScalar(list[1]));
			continue;
		}
		// Continuation line of a block-list item mapping, e.g. iterator's
		// `commits:` entries (`- sha: …` followed by indented `kind:`/`date:`).
		// Fold it into the previous item so shared bundles stay valid.
		const cont = line.match(/^\s+([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
		if (cont && currentKey && Array.isArray(obj[currentKey]) && obj[currentKey].length) {
			obj[currentKey][obj[currentKey].length - 1] += `, ${cont[1]}: ${cont[2]}`;
			continue;
		}
		const kv = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
		if (!kv) throw new Error(`cannot parse frontmatter line: ${line}`);
		currentKey = kv[1];
		obj[currentKey] = kv[2] === "" ? [] : parseScalar(kv[2]);
	}
	return obj;
}

function isMarkdown(file) {
	return extname(file).toLowerCase() === ".md";
}

export function validateBundle(bundlePath = "memory") {
	const errors = [];
	const root = bundlePath;
	const fail = (file, msg) => errors.push(`${file}: ${msg}`);

	if (!existsSync(root) || !statSync(root).isDirectory()) {
		return { ok: false, errors: [`${root}: bundle directory does not exist`] };
	}
	const rootIndex = join(root, "index.md");
	if (!existsSync(rootIndex))
		fail(relative(root, rootIndex) || "index.md", "missing root index.md");
	else {
		try {
			const fm = parseFrontmatter(readFileSync(rootIndex, "utf8"));
			if (!fm) fail("index.md", "missing frontmatter");
		} catch (err) {
			fail("index.md", err.message);
		}
	}

	function visit(dir) {
		for (const entry of readdirSync(dir)) {
			const full = join(dir, entry);
			const stat = statSync(full);
			if (stat.isDirectory()) {
				visit(full);
				continue;
			}
			if (!stat.isFile() || !isMarkdown(entry)) continue;

			const rel = relative(root, full);
			const slug = basename(entry, ".md");
			if (RESERVED.has(slug)) continue;

			let fm;
			try {
				fm = parseFrontmatter(readFileSync(full, "utf8"));
			} catch (err) {
				fail(rel, err.message);
				continue;
			}
			if (!fm) {
				fail(rel, "missing frontmatter");
				continue;
			}
			if (typeof fm.type !== "string" || !fm.type.trim())
				fail(rel, "frontmatter type is required and must be non-empty");
		}
	}
	visit(root);
	return { ok: errors.length === 0, errors };
}

export function main(argv = process.argv.slice(2)) {
	const bundle = argv[0] || "memory";
	const result = validateBundle(bundle);
	if (!result.ok) {
		process.stderr.write(`OKF validation failed for ${bundle}:\n`);
		for (const err of result.errors) process.stderr.write(`- ${err}\n`);
		return 1;
	}
	process.stdout.write(`OKF validation passed for ${bundle}\n`);
	return 0;
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	process.exitCode = main();
}
