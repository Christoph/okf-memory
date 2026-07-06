import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyReview } from "../skills/okf-init/write.mjs";
import { gatherRange } from "../skills/okf/gather.mjs";

process.env.OKF_NOW = "2026-07-06T12:00:00.000Z";

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

function makeRepo() {
	const root = mkdtempSync(join(tmpdir(), "okf-write-"));
	git(root, "init", "-q");
	return root;
}

const read = (root, ...p) => readFileSync(join(root, "memory", ...p), "utf8");

const CARD = {
	id: "patterns/error-handling",
	area: "patterns",
	action: "create",
	type: "Pattern",
	title: "Error handling",
	description: "Wrap all IO in Result.",
	tags: ["errors"],
	files: ["src/errors.ts"],
	body: "# Pattern\n\nAlways wrap IO.",
};

test("apply-review writes accepted cards, skips rejected, regenerates indexes, advances the pointer", () => {
	const root = makeRepo();
	try {
		writeFileSync(join(root, "x"), "x\n");
		git(root, "add", ".");
		git(root, "commit", "-qm", "init");
		const head = git(root, "rev-parse", "HEAD");

		const res = applyReview(
			{
				mode: "memorize",
				headCommit: head,
				memories: [CARD, { ...CARD, id: "patterns/dropped", title: "Dropped" }],
				decisions: [
					{ id: "patterns/error-handling", verdict: "accept" },
					{ id: "patterns/dropped", verdict: "reject" },
				],
			},
			root,
		);
		assert.deepEqual(res.written, ["patterns/error-handling"]);
		assert.equal(res.rejected, 1);
		assert.equal(res.advancedTo, head);
		assert.equal(res.validation.ok, true, res.validation?.output);

		const concept = read(root, "patterns", "error-handling.md");
		assert.match(concept, /type: Pattern/);
		assert.match(concept, /tags:\n  - errors/);
		assert.match(concept, /timestamp: 2026-07-06T12:00:00\.000Z/);
		assert.match(concept, /Always wrap IO\./);
		assert.ok(!existsSync(join(root, "memory", "patterns", "dropped.md")));

		assert.match(
			read(root, "patterns", "index.md"),
			/\* \[Error handling\]\(\/patterns\/error-handling\.md\) - Wrap all IO in Result\./,
		);
		const idx = read(root, "index.md");
		assert.match(idx, new RegExp(`last_memorized_commit: ${head}`));
		assert.match(idx, /\[Patterns & Conventions\]\(\/patterns\/\)/);
		assert.match(read(root, "log.md"), /\*\*Creation\*\*: Memorized \[Error handling\]/);
		assert.match(read(root, "log.md"), /\*\*Memorize\*\*: Set last_memorized_commit/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("apply-review preserves foreign root-index content and unknown concept keys on update", () => {
	const root = makeRepo();
	try {
		mkdirSync(join(root, "memory", "patterns"), { recursive: true });
		writeFileSync(
			join(root, "memory", "index.md"),
			'---\nokf_version: "0.1"\ncustom_key: keep-me\n---\n\n# Project Memory\n\n# Areas\n\n* [Patterns & Conventions](/patterns/) - House style.\n* [Plan](plan.md) - An iterator plan.\n',
		);
		writeFileSync(
			join(root, "memory", "patterns", "error-handling.md"),
			"---\ntype: Pattern\ntitle: Error handling\ndescription: Old line.\nsource_note: hand-added\n---\n\n# Pattern\n\nOld body.\n",
		);

		applyReview(
			{
				mode: "consolidate",
				memories: [{ ...CARD, action: "update", description: "New line.", body: "" }],
				decisions: [{ id: "patterns/error-handling", verdict: "accept" }],
			},
			root,
		);

		const concept = read(root, "patterns", "error-handling.md");
		assert.match(concept, /description: New line\./);
		assert.match(concept, /source_note: hand-added/, "unknown fm keys carried over");
		assert.match(concept, /Old body\./, "empty card body keeps the existing body");

		const idx = read(root, "index.md");
		assert.match(idx, /custom_key: keep-me/);
		assert.match(idx, /\* \[Plan\]\(plan\.md\) - An iterator plan\./, "iterator links preserved");
		assert.equal((idx.match(/\(\/patterns\/\)/g) || []).length, 1, "no duplicate area link");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("apply-review delete verdicts remove concepts and refresh the area index", () => {
	const root = makeRepo();
	try {
		mkdirSync(join(root, "memory", "pitfalls"), { recursive: true });
		writeFileSync(
			join(root, "memory", "pitfalls", "stale-thing.md"),
			"---\ntype: Pitfall\ntitle: Stale thing\ndescription: Gone soon.\n---\n\n# Pitfall\n",
		);
		const res = applyReview(
			{
				mode: "consolidate",
				memories: [],
				decisions: [{ id: "pitfalls/stale-thing", verdict: "delete" }],
			},
			root,
		);
		assert.deepEqual(res.deleted, ["pitfalls/stale-thing"]);
		assert.ok(!existsSync(join(root, "memory", "pitfalls", "stale-thing.md")));
		assert.doesNotMatch(read(root, "pitfalls", "index.md"), /stale-thing/);
		assert.match(read(root, "log.md"), /\*\*Deletion\*\*: Removed memory \/pitfalls\/stale-thing\.md\./);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("apply-review validates verdicts, ids, and card completeness before writing", () => {
	const root = makeRepo();
	try {
		assert.throws(() => applyReview({ decisions: [] }, root), /needs decisions/);
		assert.throws(
			() => applyReview({ decisions: [{ id: "patterns/x", verdict: "maybe" }] }, root),
			/invalid verdict/,
		);
		assert.throws(
			() => applyReview({ decisions: [{ id: "no-area", verdict: "accept" }] }, root),
			/invalid concept id/,
		);
		assert.throws(
			() => applyReview({ memories: [], decisions: [{ id: "patterns/x", verdict: "accept" }] }, root),
			/no matching draft card/,
		);
		assert.ok(!existsSync(join(root, "memory")), "nothing written on failure");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("gather range reports the commits since a valid pointer", () => {
	const root = makeRepo();
	try {
		writeFileSync(join(root, "a"), "a\n");
		git(root, "add", ".");
		git(root, "commit", "-qm", "base");
		const base = git(root, "rev-parse", "HEAD");
		mkdirSync(join(root, "memory"), { recursive: true });
		writeFileSync(
			join(root, "memory", "index.md"),
			`---\nokf_version: "0.1"\nlast_memorized_commit: ${base}\n---\n# Memory\n`,
		);
		writeFileSync(join(root, "b"), "b\n");
		git(root, "add", ".");
		git(root, "commit", "-qm", "feat: new thing");

		const r = gatherRange(root);
		assert.equal(r.baseValid, true);
		assert.equal(r.effectiveBase, base);
		assert.equal(r.commitCount, 1);
		assert.match(r.commits[0].subject, /new thing/);
		assert.equal(r.nothingToMemorize, false);

		git(root, "commit", "-qm", "empty-range-check", "--allow-empty");
		writeFileSync(
			join(root, "memory", "index.md"),
			`---\nokf_version: "0.1"\nlast_memorized_commit: ${git(root, "rev-parse", "HEAD")}\n---\n# Memory\n`,
		);
		assert.equal(gatherRange(root).nothingToMemorize, true);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("gather range flags an invalid pointer without a usable fallback", () => {
	const root = makeRepo();
	try {
		writeFileSync(join(root, "a"), "a\n");
		git(root, "add", ".");
		git(root, "commit", "-qm", "base");
		mkdirSync(join(root, "memory"), { recursive: true });
		writeFileSync(
			join(root, "memory", "index.md"),
			`---\nokf_version: "0.1"\nlast_memorized_commit: ${"f".repeat(40)}\n---\n# Memory\n`,
		);
		const r = gatherRange(root);
		assert.equal(r.baseValid, false);
		assert.equal(r.mergeBaseFallback, null);
		assert.equal(r.effectiveBase, null);
		assert.equal(r.commitCount, 0);
		assert.equal(r.nothingToMemorize, false, "an unusable base is not 'nothing to do'");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
