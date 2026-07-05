import test from "node:test";
import assert from "node:assert/strict";
import { startServer, request, withPath, sleep } from "./helpers.mjs";

async function close(server) {
	await server.stop();
}

test("GET / then POST /submit echoes one JSON line and exits 0", async () => {
	const server = startServer("init.json");
	try {
		const url = await server.ready;
		const page = await request(url);
		assert.equal(page.status, 200);
		assert.match(page.text, /okf-memory — init review/);

		const payload = {
			type: "review-approved",
			mode: "init",
			decisions: [{ id: "patterns/error-handling", verdict: "accept" }],
		};
		const submit = await request(withPath(url, "/submit"), {
			method: "POST",
			body: JSON.stringify(payload),
		});
		assert.equal(submit.status, 200);
		await server.waitForExit();
		assert.equal(server.exitCode, 0);
		assert.equal(server.stdout.trim(), JSON.stringify(payload));
	} finally {
		await close(server);
	}
});

test("embedded payload escapes </script> so fixture data cannot close script blocks", async () => {
	const server = startServer("memorize.json");
	try {
		const url = await server.ready;
		const page = await request(url);
		assert.equal(page.status, 200);
		assert.match(page.text, /\\u003c\/script>/);
		assert.doesNotMatch(page.text, /Literal safety: <\/script> must stay data/);
		await request(withPath(url, "/cancel?now=1"), { method: "POST", body: "" });
		await server.waitForExit();
	} finally {
		await close(server);
	}
});

test("wrong or missing token returns 403, keeps server alive, and leaks no stdout", async () => {
	const server = startServer("init.json");
	try {
		const url = await server.ready;
		const missing = await request(withPath(url, "/").replace(/\?t=[^&]+/, ""));
		assert.equal(missing.status, 403);
		const bad = new URL(url);
		bad.searchParams.set("t", "not-the-token");
		const wrong = await request(bad.toString());
		assert.equal(wrong.status, 403);
		await sleep(100);
		assert.equal(server.exited, false);
		assert.equal(server.stdout, "");

		const payload = { type: "cancel" };
		await request(withPath(url, "/submit"), {
			method: "POST",
			body: JSON.stringify(payload),
		});
		await server.waitForExit();
		assert.equal(server.stdout.trim(), JSON.stringify(payload));
	} finally {
		await close(server);
	}
});

test("non-local Host header returns 403", async () => {
	const server = startServer("init.json");
	try {
		const url = await server.ready;
		const res = await request(url, { headers: { Host: "example.com" } });
		assert.equal(res.status, 403);
		await request(withPath(url, "/cancel?now=1"), { method: "POST", body: "" });
		await server.waitForExit();
	} finally {
		await close(server);
	}
});

test("OKF_BIND_HOST enables sandbox remote access while preserving token checks", async () => {
	const server = startServer("init.json", { OKF_BIND_HOST: "0.0.0.0" });
	try {
		const url = await server.ready;
		assert.match(url, /http:\/\/0\.0\.0\.0:/);
		await sleep(50);
		assert.match(server.stderr, /remote bind enabled/);

		const reachableUrl = new URL(url);
		reachableUrl.hostname = "127.0.0.1";
		const withRemoteHost = await request(reachableUrl.toString(), {
			headers: { Host: "sandbox.example:8888" },
		});
		assert.equal(withRemoteHost.status, 200);

		const withoutToken = await request(
			reachableUrl.toString().replace(/\?t=[^&]+/, ""),
			{
				headers: { Host: "sandbox.example:8888" },
			},
		);
		assert.equal(withoutToken.status, 403);

		await request(withPath(reachableUrl.toString(), "/cancel?now=1"), {
			method: "POST",
			body: "",
			headers: { Host: "sandbox.example:8888" },
		});
		await server.waitForExit();
	} finally {
		await close(server);
	}
});

test("cancel grace treats reload as non-cancel, while ?now=1 cancels immediately", async () => {
	const graceful = startServer("init.json");
	try {
		const url = await graceful.ready;
		const cancel = await request(withPath(url, "/cancel"), {
			method: "POST",
			body: "",
		});
		assert.equal(cancel.status, 204);
		const reload = await request(url);
		assert.equal(reload.status, 200);
		await sleep(300);
		assert.equal(graceful.exited, false);
		const payload = { type: "review-approved", mode: "init", decisions: [] };
		await request(withPath(url, "/submit"), {
			method: "POST",
			body: JSON.stringify(payload),
		});
		await graceful.waitForExit();
		assert.equal(graceful.stdout.trim(), JSON.stringify(payload));
	} finally {
		await close(graceful);
	}

	const immediate = startServer("init.json");
	try {
		const url = await immediate.ready;
		const res = await request(withPath(url, "/cancel?now=1"), {
			method: "POST",
			body: "",
		});
		assert.equal(res.status, 204);
		await immediate.waitForExit();
		assert.equal(immediate.stdout.trim(), JSON.stringify({ type: "cancel" }));
	} finally {
		await close(immediate);
	}
});
