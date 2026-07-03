import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { COPIES } from "../scripts/sync.mjs";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");

test("bundled server libs are byte-for-byte copies of root lib/", () => {
	for (const [src, dest] of COPIES) {
		assert.equal(
			readFileSync(join(root, dest), "utf8"),
			readFileSync(join(root, src), "utf8"),
			dest,
		);
	}
});
