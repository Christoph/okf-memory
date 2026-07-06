import test from "node:test";
import assert from "node:assert/strict";
import {
	startServer,
	request,
	withPath,
	dashboardServerPath,
} from "./helpers.mjs";

test("dashboard renders memory state, plans, chunks, and action callbacks", async () => {
	const server = startServer("dashboard.json", {}, dashboardServerPath);
	try {
		const url = await server.ready;
		const page = await request(url);
		assert.equal(page.status, 200);
		assert.match(page.text, /okf-memory — project memory plane/);
		assert.match(page.text, /Memory status/);
		assert.match(page.text, /All memories/);
		assert.match(page.text, /Safe browser rendering/);
		assert.match(page.text, /draft-dashboard-card/);
		assert.match(page.text, /chunks\/draft-dashboard-card\.md/);
		assert.match(page.text, /data-action="update-memory"/);
		assert.match(page.text, /data-target="safe-browser-rendering"/);
		assert.match(page.text, /Update via comment/);
		assert.match(page.text, /Dashboard UI/);
		assert.match(page.text, /Render dashboard/);
		assert.match(page.text, /small/);
		assert.match(page.text, /~60 lines/);
		assert.match(page.text, /tests: green/);
		assert.match(page.text, /Draft memory from prompt/);

		const payload = {
			type: "dashboard-action",
			action: "implement",
			target: "plans/dashboard-ui/render-dashboard",
			prompt: "",
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

test("dashboard emits update-memory action with a slug target", async () => {
	const server = startServer("dashboard.json", {}, dashboardServerPath);
	try {
		const url = await server.ready;
		const payload = {
			type: "dashboard-action",
			action: "update-memory",
			target: "safe-browser-rendering",
			prompt: "Clarify escaping requirements.",
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

test("dashboard allows empty update-memory comments", async () => {
	const server = startServer("dashboard.json", {}, dashboardServerPath);
	try {
		const url = await server.ready;
		const payload = {
			type: "dashboard-action",
			action: "update-memory",
			target: "draft-dashboard-card",
			prompt: "",
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

test("dashboard emits create-plan action without a target", async () => {
	const server = startServer("dashboard.json", {}, dashboardServerPath);
	try {
		const url = await server.ready;
		const payload = {
			type: "dashboard-action",
			action: "create-plan",
			prompt: "",
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
