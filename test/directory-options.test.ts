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

	it("populates and deduplicates directories from existing sessions without session names in label", () => {
		const sessions = [
			{ workingDirectory: "/Users/test/repo-a", title: "Refactor backend", modifiedAt: "2026-10-04T10:00:00Z" },
			{ workingDirectory: "/Users/test/repo-b", title: "New Agent Session", modifiedAt: "2026-10-04T12:00:00Z" },
			{ workingDirectory: "/Users/test/repo-a", title: "Fix bug in backend", modifiedAt: "2026-10-04T09:00:00Z" },
			{ workingDirectory: "   ", title: "Empty dir", modifiedAt: "2026-10-04T13:00:00Z" },
		];

		const options = extractDirectoryOptions(undefined, sessions);
		assert.equal(options.length, 2);
		// repo-b (12:00) is more recent than repo-a (10:00)
		assert.deepEqual(options[0], {
			path: "/Users/test/repo-b",
			label: "/Users/test/repo-b",
			source: "session",
		});
		assert.deepEqual(options[1], {
			path: "/Users/test/repo-a",
			label: "/Users/test/repo-a",
			source: "session",
		});
	});

	it("sorts directories by the most recent session first across multiple turns/sessions in the same directory", () => {
		const sessions = [
			{ workingDirectory: "/Users/test/project-alpha", modifiedAt: "2026-10-04T08:00:00Z" },
			{ workingDirectory: "/Users/test/project-beta", modifiedAt: "2026-10-04T09:00:00Z" },
			{ workingDirectory: "/Users/test/project-gamma", modifiedAt: "2026-10-04T11:00:00Z" },
			// Later session updates project-alpha to 14:00
			{ workingDirectory: "/Users/test/project-alpha", modifiedAt: "2026-10-04T14:00:00Z" },
		];

		const options = extractDirectoryOptions(undefined, sessions);
		assert.equal(options.length, 3);
		// Expected order: project-alpha (14:00), project-gamma (11:00), project-beta (09:00)
		assert.equal(options[0].path, "/Users/test/project-alpha");
		assert.equal(options[1].path, "/Users/test/project-gamma");
		assert.equal(options[2].path, "/Users/test/project-beta");
	});

	it("does not duplicate defaultDirectory if present in sessions and sorts appropriately", () => {
		const defaultDir = "/Users/test/primary";
		const sessions = [
			{ workingDirectory: "/Users/test/primary", title: "First session", modifiedAt: "2026-10-04T15:00:00Z" },
			{ workingDirectory: "/Users/test/secondary", title: "Second project", modifiedAt: "2026-10-04T12:00:00Z" },
		];

		const options = extractDirectoryOptions(defaultDir, sessions);
		assert.equal(options.length, 2);
		// Primary is more recent (15:00) than secondary (12:00), and maintains Host Default badge
		assert.deepEqual(options[0], {
			path: "/Users/test/primary",
			label: "/Users/test/primary (Host Default)",
			source: "default",
		});
		assert.deepEqual(options[1], {
			path: "/Users/test/secondary",
			label: "/Users/test/secondary",
			source: "session",
		});
	});
});
