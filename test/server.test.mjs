import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("OKF_BIND_HOST=0.0.0.0 binds all interfaces but prints a host-clickable URL", async () => {
	const server = startServer("init.json", { OKF_BIND_HOST: "0.0.0.0" });
	try {
		const url = await server.ready;
		assert.match(url, /http:\/\/127\.0\.0\.1:/);

		const withRemoteHost = await request(url, {
			headers: { Host: "sandbox.example:8888" },
		});
		assert.equal(withRemoteHost.status, 200);

		await request(withPath(url, "/cancel?now=1"), {
			method: "POST",
			body: "",
			headers: { Host: "sandbox.example:8888" },
		});
		await server.waitForExit();
	} finally {
		await close(server);
	}
});

test("OKF_REMOTE=1 binds all interfaces and prints the URL instead of opening", async () => {
	const server = startServer("init.json", {
		OKF_REMOTE: "1",
		OKF_NO_OPEN: "",
		OKF_BIND_HOST: "",
		OKF_BROWSER: "",
		BROWSER: "",
	});
	try {
		const url = await server.ready;
		assert.match(url, /http:\/\/127\.0\.0\.1:/);
		await sleep(50);
		assert.match(server.stderr, /remote session detected/);

		const page = await request(url);
		assert.equal(page.status, 200);
		await request(withPath(url, "/cancel?now=1"), { method: "POST", body: "" });
		await server.waitForExit();
	} finally {
		await close(server);
	}
});

test("OKF_REMOTE=0 forces a loopback bind even inside a container", async () => {
	const server = startServer("init.json", {
		OKF_REMOTE: "0",
		OKF_BIND_HOST: "",
	});
	try {
		const url = await server.ready;
		assert.match(url, /http:\/\/127\.0\.0\.1:/);
		await sleep(50);
		assert.doesNotMatch(server.stderr, /remote session detected/);
		await request(withPath(url, "/cancel?now=1"), { method: "POST", body: "" });
		await server.waitForExit();
	} finally {
		await close(server);
	}
});

test("GET /__okf/status identifies the server without auth", async () => {
	const server = startServer("init.json");
	try {
		const url = await server.ready;
		const res = await request(withPath(url, "/__okf/status"));
		assert.equal(res.status, 200);
		const status = JSON.parse(res.text);
		assert.equal(status.app, "okf-memory");
		assert.equal(status.pid, server.child.pid);
	} finally {
		await close(server);
	}
});

test("SIGTERM resolves the contract with {\"type\":\"cancel\"} and exit 0", async () => {
	const server = startServer("init.json");
	try {
		await server.ready;
		server.child.kill("SIGTERM");
		const code = await server.waitForExit();
		assert.equal(code, 0);
		assert.equal(server.stdout.trim(), JSON.stringify({ type: "cancel" }));
	} finally {
		await close(server);
	}
});

test("a new server takes over the fixed port from a lingering one", async () => {
	// Shared registry + fixed port: the second server must evict the first
	// and land on the SAME port — the port a sandbox forwards (8888:8888).
	const shared = {
		OKF_REGISTRY: join(tmpdir(), `okf-takeover-${randomUUID()}.json`),
		OKF_PORT: String(18_000 + Math.floor(Math.random() * 4000)),
	};
	const first = startServer("init.json", shared);
	const firstUrl = await first.ready;
	const second = startServer("init.json", shared);
	try {
		const secondUrl = await second.ready;
		const code = await first.waitForExit();
		assert.equal(code, 0);
		assert.equal(first.stdout.trim(), JSON.stringify({ type: "cancel" }));
		assert.equal(new URL(secondUrl).port, new URL(firstUrl).port);
		assert.match(second.stderr, /closing previous UI server/);
		assert.equal(second.exited, false);
	} finally {
		await close(first);
		await close(second);
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
