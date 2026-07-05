// Copies the shared lib/ into every skill folder that runs its own server, so
// each skill directory stays droppable into Agent-Skills harnesses with no
// external dependencies. Root lib/ is the source of truth; test/sync.test.mjs
// fails if a bundled copy drifts.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVER_SKILLS = ["okf", "okf-init"];

export const COPIES = SERVER_SKILLS.flatMap((skill) => [
	["lib/server.mjs", `skills/${skill}/lib/server.mjs`],
	["lib/ui.mjs", `skills/${skill}/lib/ui.mjs`],
]);

export function sync() {
	for (const [src, dest] of COPIES) {
		mkdirSync(join(root, dirname(dest)), { recursive: true });
		copyFileSync(join(root, src), join(root, dest));
	}
}

export function checkSync() {
	const drift = [];
	for (const [src, dest] of COPIES) {
		const srcPath = join(root, src);
		const destPath = join(root, dest);
		if (!existsSync(destPath)) {
			drift.push(`${dest} is missing`);
			continue;
		}
		if (readFileSync(destPath, "utf8") !== readFileSync(srcPath, "utf8")) {
			drift.push(`${dest} differs from ${src}`);
		}
	}
	return drift;
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	if (process.argv.includes("--check")) {
		const drift = checkSync();
		if (drift.length) {
			process.stderr.write(
				`sync check failed:\n${drift.map((item) => `- ${item}`).join("\n")}\n`,
			);
			process.exitCode = 1;
		} else {
			process.stdout.write("bundled libs are in sync\n");
		}
	} else {
		sync();
		process.stdout.write(`synced ${COPIES.length} files into skill folders\n`);
	}
}
