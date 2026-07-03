import test from "node:test";
import assert from "node:assert/strict";
import { startServer, request, withPath } from "./helpers.mjs";

test("memorize review renders conflicts, summaries, and grouped cards", async () => {
	const server = startServer("memorize.json");
	try {
		const url = await server.ready;
		const page = await request(url);
		assert.equal(page.status, 200);
		assert.match(page.text, /okf-memory — memorize review/);
		assert.match(page.text, /CONFLICT/);
		assert.match(
			page.text,
			/Existing memory says handlers return Result values instead of throwing/,
		);
		assert.match(
			page.text,
			/Patterns &amp; Conventions <span class="count">2<\/span>/,
		);
		assert.match(page.text, /abc1234\.\.def5678/);
		await request(withPath(url, "/cancel?now=1"), { method: "POST", body: "" });
		await server.waitForExit();
	} finally {
		await server.stop();
	}
});

test("consolidate review renders stale badge and current versions for keep/update", async () => {
	const server = startServer("consolidate.json");
	try {
		const url = await server.ready;
		const page = await request(url);
		assert.equal(page.status, 200);
		assert.match(page.text, /okf-memory — consolidate review/);
		assert.match(page.text, /STALE/);
		assert.match(
			page.text,
			/Referenced file packages\/api\/src\/server.ts no longer exists/,
		);
		assert.match(page.text, /Current version on disk/);
		assert.match(page.text, /Architecture <span class="count">1<\/span>/);
		assert.match(
			page.text,
			/Patterns &amp; Conventions <span class="count">1<\/span>/,
		);
		await request(withPath(url, "/cancel?now=1"), { method: "POST", body: "" });
		await server.waitForExit();
	} finally {
		await server.stop();
	}
});

test("POSTed feedback body round-trips verbatim", async () => {
	const server = startServer("init.json");
	try {
		const url = await server.ready;
		const payload = {
			type: "review-feedback",
			mode: "init",
			decisions: [
				{ id: "patterns/error-handling", verdict: "accept" },
				{ id: "setup/test-command", verdict: "reject" },
			],
			comments: [
				{
					id: "patterns/error-handling",
					comment: "Mention middleware file. Keep > and < chars.",
				},
			],
			general: "Add one architecture memory.",
		};
		const res = await request(withPath(url, "/submit"), {
			method: "POST",
			body: JSON.stringify(payload),
		});
		assert.equal(res.status, 200);
		await server.waitForExit();
		assert.equal(server.stdout.trim(), JSON.stringify(payload));
	} finally {
		await server.stop();
	}
});
