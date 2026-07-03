import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import http from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
export const serverPath = join(root, "skills/okf-init/server.mjs");
export const fixturePath = (name) => join(root, "test/fixtures", name);

export function startServer(input, extraEnv = {}) {
	let payload;
	if (typeof input === "string" && input.endsWith(".json")) {
		payload = readFileSync(fixturePath(input), "utf8");
	} else if (typeof input === "string") {
		payload = input;
	} else {
		payload = JSON.stringify(input);
	}
	const child = spawn(process.execPath, [serverPath], {
		cwd: root,
		env: {
			...process.env,
			OKF_NO_OPEN: "1",
			OKF_PORT: "0",
			OKF_CANCEL_GRACE_MS: "250",
			...extraEnv,
		},
		stdio: ["pipe", "pipe", "pipe"],
	});
	child.stdin.end(payload);

	let stdout = "";
	let stderr = "";
	let exited = false;
	let exitCode = null;
	child.stdout.setEncoding("utf8");
	child.stderr.setEncoding("utf8");
	child.stdout.on("data", (d) => {
		stdout += d;
	});
	child.stderr.on("data", (d) => {
		stderr += d;
	});
	child.on("exit", (code) => {
		exited = true;
		exitCode = code;
	});

	const ready = new Promise((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error(`server did not start; stderr=${stderr}`)),
			5000,
		);
		child.stderr.on("data", () => {
			const match = stderr.match(/listening on (http:\/\/[^\s]+)/);
			if (match) {
				clearTimeout(timer);
				resolve(match[1]);
			}
		});
		child.on("exit", (code) => {
			clearTimeout(timer);
			reject(
				new Error(
					`server exited before listen (${code}); stderr=${stderr}; stdout=${stdout}`,
				),
			);
		});
	});

	return {
		child,
		ready,
		get stdout() {
			return stdout;
		},
		get stderr() {
			return stderr;
		},
		get exited() {
			return exited;
		},
		get exitCode() {
			return exitCode;
		},
		async stop() {
			if (!exited) child.kill("SIGTERM");
		},
		async waitForExit(ms = 2000) {
			if (exited) return exitCode;
			return await new Promise((resolve, reject) => {
				const timer = setTimeout(
					() =>
						reject(
							new Error(
								`server did not exit; stdout=${stdout}; stderr=${stderr}`,
							),
						),
					ms,
				);
				child.once("exit", (code) => {
					clearTimeout(timer);
					resolve(code);
				});
			});
		},
	};
}

export function withPath(url, path) {
	let u;
	let p;
	try {
		u = new URL(url);
		p = new URL(path, u.origin);
	} catch (err) {
		throw new Error(`invalid test URL: ${err.message}`);
	}
	const token = u.searchParams.get("t");
	if (!p.searchParams.has("t") && token) p.searchParams.set("t", token);
	return p.toString();
}

export function request(url, { method = "GET", body, headers = {} } = {}) {
	return new Promise((resolve, reject) => {
		let u;
		try {
			u = new URL(url);
		} catch (err) {
			reject(new Error(`invalid request URL: ${err.message}`));
			return;
		}
		const req = http.request(
			{
				protocol: u.protocol,
				hostname: u.hostname,
				port: u.port,
				path: u.pathname + u.search,
				method,
				headers:
					body === null || body === undefined
						? headers
						: {
								"Content-Type": "application/json",
								"Content-Length": Buffer.byteLength(body),
								...headers,
							},
			},
			(res) => {
				let text = "";
				res.setEncoding("utf8");
				res.on("data", (d) => {
					text += d;
				});
				res.on("end", () =>
					resolve({ status: res.statusCode, headers: res.headers, text }),
				);
			},
		);
		req.on("error", reject);
		if (body !== null && body !== undefined) req.write(body);
		req.end();
	});
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
