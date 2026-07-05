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
		assert.match(page.text, /Dashboard UI/);
		assert.match(page.text, /Render dashboard/);
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
