#!/usr/bin/env node
import http from "node:http";
import { exec } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
	existsSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";

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

// Single-instance takeover. The dashboard must sit on a *stable* port — a
// sandbox forwards exactly one port (pi-docker-sandbox-setup publishes
// 8888:8888), so an orphaned server that pushes the next run to 8889 makes
// the UI unreachable from the host. Each server records { pid, port } in a
// per-user registry file; the next server verifies the recorded process is
// really a lingering okf-memory UI (tokenless read-only status endpoint, so
// a reused pid is never killed by mistake), SIGTERMs it, and takes the port.
const STATUS_PATH = "/__okf/status";

// Per-run id, embedded into the page (lib/ui.mjs) and echoed on /submit and
// /cancel. With one fixed shared port, a tab left over from an EARLIER round
// fires its pagehide /cancel beacon at the CURRENT server when closed —
// without this check that silently cancelled the live round (the "dashboard
// cancels while I type" bug). Mismatched ids are ignored; absent ids are
// allowed so curl and scripts keep working. Not an auth secret.
export const RUN_ID = randomBytes(8).toString("hex");

export function registryPath() {
	if (process.env.OKF_REGISTRY) return process.env.OKF_REGISTRY;
	let uid = "u";
	try {
		uid = String(userInfo().uid);
	} catch {}
	return join(tmpdir(), `okf-ui-${uid}.json`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function takeoverStale(regPath) {
	let reg;
	try {
		reg = JSON.parse(readFileSync(regPath, "utf8"));
	} catch {
		return;
	}
	if (
		!reg ||
		!Number.isInteger(reg.pid) ||
		!Number.isInteger(reg.port) ||
		reg.pid === process.pid
	)
		return;
	let status = null;
	try {
		const res = await fetch(`http://127.0.0.1:${reg.port}${STATUS_PATH}`, {
			signal: AbortSignal.timeout(500),
		});
		if (res.ok) status = await res.json().catch(() => null);
	} catch {}
	if (status && status.app === "okf-memory" && status.pid === reg.pid) {
		process.stderr.write(
			`okf-memory: closing previous UI server (pid ${reg.pid}, port ${reg.port})\n`,
		);
		try {
			process.kill(reg.pid, "SIGTERM");
		} catch {}
		const deadline = Date.now() + 2000;
		while (Date.now() < deadline) {
			try {
				process.kill(reg.pid, 0);
			} catch {
				break;
			}
			await sleep(50);
		}
		try {
			process.kill(reg.pid, 0);
			process.kill(reg.pid, "SIGKILL");
		} catch {}
	}
	try {
		unlinkSync(regPath);
	} catch {}
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

/**
 * Serve one review round. `onSubmit(result)` — optional — runs after the
 * browser answers and may return a transformed object to print instead (used
 * to apply purely-mechanical results, e.g. review verdicts, in code before
 * the agent ever sees them). A throwing onSubmit annotates the original
 * result with { applied: { ok: false, error } } rather than losing it.
 */
export async function serve({ step = "app", html, onSubmit }) {
	const startPort = parseInt(process.env.OKF_PORT || "8888", 10);
	const MAX_PORT_RETRIES = 20;
	const remote = isRemoteSession();
	const host = bindHost(remote);
	const regPath = registryPath();
	let done = false;
	let cancelTimer = null;

	const finish = (obj, exitCode = 0) => {
		if (done) return;
		done = true;
		if (obj) process.stdout.write(JSON.stringify(obj) + "\n");
		try {
			const cur = JSON.parse(readFileSync(regPath, "utf8"));
			if (cur && cur.pid === process.pid) unlinkSync(regPath);
		} catch {}
		try {
			server.close();
		} catch {}
		process.exit(exitCode);
	};

	// A superseded/interrupted server must free the port *and* still honor
	// the one-JSON-line contract, so signals resolve as a cancel.
	for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"]) {
		process.on(sig, () => finish({ type: "cancel" }));
	}

	const server = http.createServer((req, res) => {
		const url = new URL(req.url, "http://127.0.0.1");
		if (req.method === "GET" && url.pathname === STATUS_PATH) {
			// Read-only; lets a successor verify the port holder before
			// signalling it (see takeoverStale above).
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ app: "okf-memory", step, pid: process.pid }));
		} else if (req.method === "GET" && url.pathname === "/") {
			if (cancelTimer) {
				clearTimeout(cancelTimer);
				cancelTimer = null;
			}
			res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
			res.end(html);
		} else if (req.method === "POST" && url.pathname === "/submit") {
			const r = url.searchParams.get("r");
			if (r && r !== RUN_ID) {
				process.stderr.write(
					"okf-memory: ignored /submit from a previous run's tab\n",
				);
				res.writeHead(409);
				res.end();
				return;
			}
			let body = "";
			req.on("data", (c) => (body += c));
			req.on("end", async () => {
				res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
				res.end(doneHtml());
				if (!done) {
					done = true;
					let out = body.trim() || "{}";
					if (onSubmit) {
						try {
							const transformed = await onSubmit(JSON.parse(out));
							if (transformed) out = JSON.stringify(transformed);
						} catch (e) {
							try {
								const parsed = JSON.parse(out);
								parsed.applied = { ok: false, error: e.message };
								out = JSON.stringify(parsed);
							} catch {}
						}
					}
					process.stdout.write(out + "\n");
					try {
						server.close();
					} catch {}
					setTimeout(() => process.exit(0), 30).unref();
				}
			});
		} else if (req.method === "POST" && url.pathname === "/cancel") {
			const r = url.searchParams.get("r");
			let body = "";
			req.on("data", (c) => (body += c));
			req.on("end", () => {
				res.writeHead(204);
				res.end();
				if (r && r !== RUN_ID) {
					process.stderr.write(
						"okf-memory: ignored /cancel from a previous run's tab\n",
					);
					return;
				}
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
		// Record ourselves so the next server can find and replace us even if
		// we are never answered (no more orphans holding the forwarded port).
		try {
			writeFileSync(
				regPath,
				JSON.stringify({
					pid: process.pid,
					port,
					step,
					started: new Date().toISOString(),
				}) + "\n",
				{ mode: 0o600 },
			);
		} catch {}
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

	// Replace a lingering okf-memory UI before binding, so consecutive runs
	// stay on the same fixed port (OKF_NO_TAKEOVER=1 opts out, e.g. in tests).
	if (!process.env.OKF_NO_TAKEOVER) await takeoverStale(regPath);

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
