#!/usr/bin/env node
import http from "node:http";
import { exec } from "node:child_process";
import { existsSync } from "node:fs";

export function readStdin() {
	return new Promise((resolve) => {
		let raw = "";
		process.stdin.setEncoding("utf8");
		process.stdin.on("data", (c) => (raw += c));
		process.stdin.on("end", () => resolve(raw));
		if (process.stdin.isTTY) resolve("");
	});
}

export async function readPayload() {
	const raw = await readStdin();
	try {
		return JSON.parse(raw || "{}");
	} catch {
		return {};
	}
}

const TIMEOUT_MS = 7_200_000; // 2 hours
const CANCEL_GRACE_MS = parseInt(process.env.OKF_CANCEL_GRACE_MS || "2500", 10);
const BROWSER_DISABLED_RE = /^(false|none|0|:)$/i;

// Tri-state override, then SSH markers, then container markers. Inside a
// container or SSH session the browser lives on the host, so we bind all
// interfaces (the harness forwards the port) and print the URL instead of
// spawning an opener that has no display to talk to.
export function isRemoteSession(env = process.env) {
	const override = String(env.OKF_REMOTE ?? "").toLowerCase();
	if (override === "1" || override === "true") return true;
	if (override === "0" || override === "false") return false;
	if (env.SSH_TTY || env.SSH_CONNECTION) return true;
	return existsSync("/.dockerenv") || existsSync("/run/.containerenv");
}

function bindHost(remote) {
	const explicit = (process.env.OKF_BIND_HOST || "").trim();
	if (explicit) return explicit;
	return remote ? "0.0.0.0" : "127.0.0.1";
}

function browserCommand(remote) {
	const configured = (
		process.env.OKF_BROWSER ||
		process.env.BROWSER ||
		""
	).trim();
	if (BROWSER_DISABLED_RE.test(configured)) return null;
	if (configured) return `${configured} "%s"`;
	if (process.env.OKF_NO_OPEN || remote) return null;
	if (process.platform === "win32") return 'start "" "%s"';
	if (process.platform === "darwin") return 'open "%s"';
	return 'xdg-open "%s"';
}

export function serve({ step = "app", html }) {
	const startPort = parseInt(process.env.OKF_PORT || "8888", 10);
	const MAX_PORT_RETRIES = 20;
	const remote = isRemoteSession();
	const host = bindHost(remote);
	let done = false;
	let cancelTimer = null;

	const finish = (obj, exitCode = 0) => {
		if (done) return;
		done = true;
		if (obj) process.stdout.write(JSON.stringify(obj) + "\n");
		try {
			server.close();
		} catch {}
		process.exit(exitCode);
	};

	const server = http.createServer((req, res) => {
		const url = new URL(req.url, "http://127.0.0.1");
		if (req.method === "GET" && url.pathname === "/") {
			if (cancelTimer) {
				clearTimeout(cancelTimer);
				cancelTimer = null;
			}
			res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
			res.end(html);
		} else if (req.method === "POST" && url.pathname === "/submit") {
			let body = "";
			req.on("data", (c) => (body += c));
			req.on("end", () => {
				res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
				res.end(doneHtml());
				if (!done) {
					done = true;
					process.stdout.write((body.trim() || "{}") + "\n");
					try {
						server.close();
					} catch {}
					setTimeout(() => process.exit(0), 30).unref();
				}
			});
		} else if (req.method === "POST" && url.pathname === "/cancel") {
			let body = "";
			req.on("data", (c) => (body += c));
			req.on("end", () => {
				res.writeHead(204);
				res.end();
				if (done || cancelTimer) return;
				if (url.searchParams.get("now") === "1") {
					finish({ type: "cancel" });
					return;
				}
				cancelTimer = setTimeout(
					() => finish({ type: "cancel" }),
					CANCEL_GRACE_MS,
				);
			});
		} else {
			res.writeHead(404);
			res.end();
		}
	});

	const onListen = () => {
		const { port } = server.address();
		const displayHost =
			host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
		const url = `http://${displayHost}:${port}/`;
		const opener = browserCommand(remote);
		if (opener) exec(opener.replace("%s", url));
		process.stderr.write(`okf-memory: ${step} listening on ${url}\n`);
		if (remote && !opener) {
			process.stderr.write(
				`okf-memory: remote session detected — open ${url} in your host browser (forward port ${port} if it is not published)\n`,
			);
		}
	};

	const tryListen = (port, attemptsLeft) => {
		const onError = (err) => {
			if (err.code === "EADDRINUSE" && attemptsLeft > 0) {
				tryListen(port + 1, attemptsLeft - 1);
			} else if (err.code === "EADDRINUSE") {
				server.removeListener("error", onError);
				server.once("error", (e) => {
					process.stderr.write(`okf-memory: server error: ${e.message}\n`);
					finish(null, 1);
				});
				server.listen(0, host, onListen);
			} else {
				process.stderr.write(`okf-memory: server error: ${err.message}\n`);
				finish(null, 1);
			}
		};
		server.once("error", onError);
		server.listen(port, host, () => {
			server.removeListener("error", onError);
			onListen();
		});
	};

	tryListen(startPort, MAX_PORT_RETRIES);

	setTimeout(() => {
		process.stderr.write("okf-memory: timeout (2h), no response received\n");
		finish({ type: "timeout" });
	}, TIMEOUT_MS).unref();
}

export function doneHtml(msg = "Sent to Claude") {
	return `<!DOCTYPE html><html data-theme="dark"><head><meta charset="UTF-8"><style>
*{box-sizing:border-box;margin:0;padding:0}body{background:#0d1117;color:#7ee787;
font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;
height:100vh;flex-direction:column;gap:12px}p{color:#8b949e;font-size:14px}</style></head>
<body><h2>✓ ${msg}</h2><p>You can close this tab.</p></body></html>`;
}
