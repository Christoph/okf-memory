import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gather, frontmatter } from "../skills/okf/gather.mjs";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");

const git = (dir, ...args) =>
	execFileSync("git", args, {
		cwd: dir,
		encoding: "utf8",
		env: {
			...process.env,
			GIT_AUTHOR_NAME: "t",
			GIT_AUTHOR_EMAIL: "t@t",
			GIT_COMMITTER_NAME: "t",
			GIT_COMMITTER_EMAIL: "t@t",
		},
	}).trim();

/** Throwaway project: valid-memory fixture as memory/, one plan + chunk. */
function makeFixture() {
	const dir = mkdtempSync(join(tmpdir(), "okf-gather-"));
	git(dir, "init", "-q");
	cpSync(join(root, "test/fixtures/valid-memory"), join(dir, "memory"), {
		recursive: true,
	});
	mkdirSync(join(dir, "memory/plans/dashboard-ui"), { recursive: true });
	writeFileSync(
		join(dir, "memory/plans/dashboard-ui.md"),
		`---
type: Plan
title: Dashboard UI
description: Add a browser memory plane.
status: in-progress
branch: feature/dashboard
created: 2026-07-06
files:
  - skills/okf/server.mjs
---

body
`,
	);
	writeFileSync(
		join(dir, "memory/plans/dashboard-ui/render-dashboard.md"),
		`---
type: Work Chunk
title: Render dashboard
description: Render state and actions.
status: pending
plan: plans/dashboard-ui
size: small
lines_estimate: 60
tests_status: green
depends_on:
  - plans/dashboard-ui/design-schema
files:
  - skills/okf/server.mjs
---

chunk body
`,
	);
	mkdirSync(join(dir, "memory/chunks"), { recursive: true });
	writeFileSync(
		join(dir, "memory/chunks/draft-slug.md"),
		`---
type: Chunk
title: Draft slug
description: Draft chunk visible from disk.
status: draft
size: small
lines_estimate: 40
depends_on: []
files:
  - skills/okf/gather.mjs
---

chunk body
`,
	);
	writeFileSync(join(dir, "tracked.txt"), "x\n");
	git(dir, "add", "tracked.txt");
	git(dir, "commit", "-q", "-m", "init");
	return dir;
}

test("gather builds the dashboard payload from bundle + git state", () => {
	const dir = makeFixture();
	try {
		const p = gather(dir);
		assert.equal(p.bundlePath, "memory/");
		assert.equal(p.memory.initialized, true);
		assert.equal(p.memory.okfVersion, "0.1");
		assert.equal(p.memory.lastMemorizedCommit, "abc123");
		// error-handling.md (patterns) + plan + legacy chunk + draft chunk = 4 concepts
		assert.equal(p.memory.conceptCount, 4);
		// every concept's files anchor points at untracked paths in this repo
		assert.ok(p.memory.staleCount >= 1);
		assert.equal(p.areas.length, 5);
		assert.equal(p.areas.find((a) => a.id === "patterns").count, 1);

		assert.equal(p.plans.length, 1);
		assert.equal(p.plans[0].id, "plans/dashboard-ui");
		assert.equal(p.plans[0].branch, "feature/dashboard");
		assert.equal(p.plans[0].created, "2026-07-06");
		assert.deepEqual(p.plans[0].files, ["skills/okf/server.mjs"]);
		assert.deepEqual(p.plans[0].chunks, [
			"plans/dashboard-ui/render-dashboard",
		]);
		assert.equal(p.chunks.length, 2);
		const legacyChunk = p.chunks.find(
			(c) => c.id === "plans/dashboard-ui/render-dashboard",
		);
		assert.ok(legacyChunk);
		assert.equal(legacyChunk.slug, "render-dashboard");
		assert.equal(legacyChunk.planId, "plans/dashboard-ui");
		assert.equal(legacyChunk.path, "plans/dashboard-ui/render-dashboard.md");
		assert.equal(legacyChunk.size, "small");
		assert.equal(legacyChunk.linesEstimate, "60");
		assert.equal(legacyChunk.testsStatus, "green");
		assert.deepEqual(legacyChunk.dependsOn, [
			"plans/dashboard-ui/design-schema",
		]);
		assert.match(legacyChunk.body, /chunk body/);

		const draftChunk = p.chunks.find((c) => c.id === "draft-slug");
		assert.ok(draftChunk);
		assert.equal(draftChunk.slug, "draft-slug");
		assert.equal(draftChunk.path, "chunks/draft-slug.md");
		assert.equal(draftChunk.status, "draft");
		assert.deepEqual(draftChunk.dependsOn, []);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("gather without a bundle reports uninitialized with the standard areas", () => {
	const dir = mkdtempSync(join(tmpdir(), "okf-gather-"));
	try {
		git(dir, "init", "-q");
		const p = gather(dir);
		assert.equal(p.memory.initialized, false);
		assert.equal(p.memory.conceptCount, 0);
		assert.equal(p.areas.length, 5);
		assert.deepEqual(p.plans, []);
		assert.deepEqual(p.chunks, []);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("frontmatter parses scalars and block lists and returns the body", () => {
	const { fm, body } = frontmatter(`---
type: Plan
title: "Quoted"
depends_on:
  - a
  - b
---

hello
`);
	assert.equal(fm.type, "Plan");
	assert.equal(fm.title, "Quoted");
	assert.deepEqual(fm.depends_on, ["a", "b"]);
	assert.equal(body.trim(), "hello");
});
