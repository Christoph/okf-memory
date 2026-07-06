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
		// error-handling.md (patterns) + plan + chunk = 3 concepts
		assert.equal(p.memory.conceptCount, 3);
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
		assert.equal(p.chunks.length, 1);
		assert.equal(p.chunks[0].planId, "plans/dashboard-ui");
		assert.equal(p.chunks[0].size, "small");
		assert.equal(p.chunks[0].linesEstimate, "60");
		assert.equal(p.chunks[0].testsStatus, "green");
		assert.deepEqual(p.chunks[0].dependsOn, [
			"plans/dashboard-ui/design-schema",
		]);
		assert.match(p.chunks[0].body, /chunk body/);
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
