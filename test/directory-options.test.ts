import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractDirectoryOptions } from "../src/utils/directory-options.ts";

describe("extractDirectoryOptions", () => {
	it("returns empty array when neither defaultDirectory nor sessions are provided", () => {
		assert.deepEqual(extractDirectoryOptions(), []);
		assert.deepEqual(extractDirectoryOptions("", []), []);
		assert.deepEqual(extractDirectoryOptions("   ", undefined), []);
	});

	it("includes defaultDirectory labeled with Host Default", () => {
		const options = extractDirectoryOptions("/Users/test/workspace");
		assert.equal(options.length, 1);
		assert.deepEqual(options[0], {
			path: "/Users/test/workspace",
			label: "/Users/test/workspace (Host Default)",
			source: "default",
		});
	});

	it("populates and deduplicates directories from existing sessions", () => {
		const sessions = [
			{ workingDirectory: "/Users/test/repo-a", title: "Refactor backend" },
			{ workingDirectory: "/Users/test/repo-b", title: "New Agent Session" },
			{ workingDirectory: "/Users/test/repo-a", title: "Fix bug in backend" }, // Duplicate repo-a
			{ workingDirectory: "   ", title: "Empty dir" },
		];

		const options = extractDirectoryOptions(undefined, sessions);
		assert.equal(options.length, 2);
		assert.deepEqual(options[0], {
			path: "/Users/test/repo-a",
			label: "/Users/test/repo-a (Refactor backend)",
			source: "session",
		});
		assert.deepEqual(options[1], {
			path: "/Users/test/repo-b",
			label: "/Users/test/repo-b",
			source: "session",
		});
	});

	it("does not duplicate defaultDirectory if present in sessions", () => {
		const defaultDir = "/Users/test/primary";
		const sessions = [
			{ workingDirectory: "/Users/test/primary", title: "First session" },
			{ workingDirectory: "/Users/test/secondary", title: "Second project" },
		];

		const options = extractDirectoryOptions(defaultDir, sessions);
		assert.equal(options.length, 2);
		assert.deepEqual(options[0], {
			path: "/Users/test/primary",
			label: "/Users/test/primary (Host Default)",
			source: "default",
		});
		assert.deepEqual(options[1], {
			path: "/Users/test/secondary",
			label: "/Users/test/secondary (Second project)",
			source: "session",
		});
	});
});
