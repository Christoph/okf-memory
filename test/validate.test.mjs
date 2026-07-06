import test from "node:test";
import assert from "node:assert/strict";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateBundle } from "../scripts/validate.mjs";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");

function makeBundle(files) {
	const root = mkdtempSync(join(tmpdir(), "okf-memory-"));
	const memory = join(root, "memory");
	mkdirSync(memory, { recursive: true });
	for (const [rel, body] of Object.entries(files)) {
		const full = join(memory, rel);
		mkdirSync(join(full, ".."), { recursive: true });
		writeFileSync(full, body);
	}
	return memory;
}

test("validator passes a conforming OKF memory bundle", () => {
	const bundle = makeBundle({
		"index.md":
			'---\nokf_version: "0.1"\nlast_memorized_commit: abc123\n---\n# Memory\n',
		"log.md": "# Log\n",
		"patterns/index.md": "# Patterns\n",
		"patterns/error-handling.md":
			"---\ntype: Pattern\ntitle: Error handling\ndescription: One sentence.\ntags:\n  - errors\ntimestamp: 2026-07-02T00:00:00.000Z\nfiles:\n  - src/errors.ts\n---\n# Error handling\n",
	});
	assert.deepEqual(validateBundle(bundle), { ok: true, errors: [] });
});

test("validator accepts an extension contract concept", () => {
	const bundle = makeBundle({
		"index.md":
			'---\nokf_version: "0.1"\n---\n# Memory\n\n* [Extension contract](EXTENSIONS.md) - How extensions should read and update memory.\n',
		"EXTENSIONS.md":
			"---\ntype: Reference\ntitle: okf-memory extension contract\ndescription: How extensions read and update the bundle.\ntags:\n  - extensions\ntimestamp: 2026-07-06T00:00:00.000Z\n---\n# Extension contract\n",
	});
	assert.deepEqual(validateBundle(bundle), { ok: true, errors: [] });
});

test("validator accepts integrated plan and chunk concepts", () => {
	const bundle = makeBundle({
		"index.md":
			'---\nokf_version: "0.1"\nlast_memorized_commit: abc123\n---\n# Memory\n\n* [Plans](/plans/) - Work plans.\n',
		"plans/index.md": "# Plans\n",
		"plans/dashboard-ui.md":
			"---\ntype: Plan\ntitle: Dashboard UI\ndescription: Add a browser memory plane.\nstatus: approved\n---\n# Goal\n",
		"plans/dashboard-ui/index.md": "# Dashboard UI\n",
		"plans/dashboard-ui/render-dashboard.md":
			"---\ntype: Work Chunk\ntitle: Render dashboard\ndescription: Render the dashboard.\nstatus: pending\nplan: plans/dashboard-ui\ndepends_on:\n  - plans/dashboard-ui/design-schema\nfiles:\n  - skills/okf/server.mjs\n---\n# Implementation notes\n",
	});
	assert.deepEqual(validateBundle(bundle), { ok: true, errors: [] });
});

test("validator fails missing frontmatter on root index", () => {
	const bundle = makeBundle({
		"index.md": "# Memory\n",
	});
	const result = validateBundle(bundle);
	assert.equal(result.ok, false);
	assert.match(result.errors.join("\n"), /index\.md: missing frontmatter/);
});

test("validator fails missing frontmatter on concept files", () => {
	const bundle = makeBundle({
		"index.md": '---\nokf_version: "0.1"\n---\n# Memory\n',
		"patterns/index.md": "# Patterns\n",
		"patterns/no-frontmatter.md": "# Missing\n",
	});
	const result = validateBundle(bundle);
	assert.equal(result.ok, false);
	assert.match(result.errors.join("\n"), /missing frontmatter/);
});

test("validator fails empty type values", () => {
	const bundle = makeBundle({
		"index.md": '---\nokf_version: "0.1"\n---\n# Memory\n',
		"setup/index.md": "# Setup\n",
		"setup/commands.md": "---\ntype: \ntitle: Commands\n---\n# Commands\n",
	});
	const result = validateBundle(bundle);
	assert.equal(result.ok, false);
	assert.match(result.errors.join("\n"), /type is required/);
});

test("validator allows log.md files at any bundle level", () => {
	const bundle = makeBundle({
		"index.md": '---\nokf_version: "0.1"\n---\n# Memory\n',
		"log.md": "# Root log\n",
		"patterns/index.md": "# Patterns\n",
		"patterns/log.md": "# Area log\n",
		"patterns/error-handling.md": "---\ntype: Pattern\n---\n# Good\n",
	});
	assert.deepEqual(validateBundle(bundle), { ok: true, errors: [] });
});

test("validator checks root-level concept files", () => {
	const bundle = makeBundle({
		"index.md": '---\nokf_version: "0.1"\n---\n# Memory\n',
		"root-concept.md": "# Missing\n",
	});
	const result = validateBundle(bundle);
	assert.equal(result.ok, false);
	assert.match(
		result.errors.join("\n"),
		/root-concept\.md: missing frontmatter/,
	);
});

test("validator checks nested concept files recursively", () => {
	const bundle = makeBundle({
		"index.md": '---\nokf_version: "0.1"\n---\n# Memory\n',
		"patterns/index.md": "# Patterns\n",
		"patterns/nested/missing.md": "# Missing\n",
	});
	const result = validateBundle(bundle);
	assert.equal(result.ok, false);
	assert.match(
		result.errors.join("\n"),
		/patterns\/nested\/missing\.md: missing frontmatter/,
	);
});

test("skill files include Claude-discoverable YAML frontmatter", () => {
	const skillsDir = join(root, "skills");
	for (const skill of readdirSync(skillsDir)) {
		const text = readFileSync(join(skillsDir, skill, "SKILL.md"), "utf8");
		const match = text.match(/^---\n([\s\S]*?)\n---\n/);
		assert.ok(match, `${skill}/SKILL.md is missing frontmatter`);
		assert.match(match[1], /^name:\s*\S+/m, `${skill}/SKILL.md missing name`);
		assert.match(
			match[1],
			/^description:\s*\S+/m,
			`${skill}/SKILL.md missing description`,
		);
	}
});

test("validator tolerates iterator's commits block list on chunk concepts", () => {
	const bundle = makeBundle({
		"index.md":
			'---\nokf_version: "0.1"\nlast_memorized_commit: abc123\n---\n# Memory\n',
		"chunks/index.md": "# Chunks\n",
		"chunks/auth-middleware.md":
			'---\ntype: Chunk\ntitle: Auth middleware\ndescription: JWT middleware.\nstatus: done\ndepends_on: []\nfiles: ["src/auth.ts"]\ntimestamp: 2026-07-06T00:00:00.000Z\ndone: 2026-07-06\ncommits:\n  - sha: 7bfc791b2f33c3661ce1e69e02198bd156af1f2d\n    kind: implement\n    date: 2026-07-06\n---\n# Implementation notes\n',
	});
	assert.deepEqual(validateBundle(bundle), { ok: true, errors: [] });
});
