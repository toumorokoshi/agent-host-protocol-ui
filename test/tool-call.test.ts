import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatToolArgumentsPreview } from "../src/utils/format-tool-args.ts";
import type { UiToolCall } from "../src/types.ts";

describe("formatToolArgumentsPreview", () => {
	it("returns empty string for empty or nullish arguments", () => {
		assert.equal(formatToolArgumentsPreview(""), "");
		assert.equal(formatToolArgumentsPreview({}), "");
		assert.equal(formatToolArgumentsPreview(null as any), "");
		assert.equal(formatToolArgumentsPreview(undefined as any), "");
	});

	it("extracts command argument cleanly", () => {
		const preview = formatToolArgumentsPreview({ command: "git status --short", cwd: "/workspace" });
		assert.equal(preview, "git status --short");
	});

	it("extracts path or absolutePath argument cleanly", () => {
		const previewPath = formatToolArgumentsPreview({ path: "src/App.tsx" });
		assert.equal(previewPath, "src/App.tsx");

		const previewAbs = formatToolArgumentsPreview({ absolutePath: "/Users/dev/project/README.md" });
		assert.equal(previewAbs, "/Users/dev/project/README.md");

		const previewFile = formatToolArgumentsPreview({ filePath: "package.json" });
		assert.equal(previewFile, "package.json");
	});

	it("extracts query and url arguments cleanly", () => {
		const previewQuery = formatToolArgumentsPreview({ query: "handleSelectSession", searchPath: "src/" });
		assert.equal(previewQuery, "handleSelectSession");

		const previewUrl = formatToolArgumentsPreview({ url: "https://example.com/api" });
		assert.equal(previewUrl, "https://example.com/api");
	});

	it("truncates long string arguments gracefully", () => {
		const longString = "This is a very long string argument that exceeds the maximum preview length of forty characters";
		const preview = formatToolArgumentsPreview(longString);
		assert.ok(preview.length <= 40);
		assert.ok(preview.endsWith("..."));
	});

	it("formats generic object key-value pair when specific fields are not present", () => {
		const preview = formatToolArgumentsPreview({ model: "claude-3-7-sonnet" });
		assert.equal(preview, "model: claude-3-7-sonnet");
	});
});

describe("UiToolCall Model & Collapsible State", () => {
	it("represents tool call lifecycle with status and arguments", () => {
		const tool: UiToolCall = {
			id: "tc-101",
			name: "run_command",
			arguments: { command: "npm test" },
			status: "completed",
			result: "All 60 tests passed",
		};

		assert.equal(tool.id, "tc-101");
		assert.equal(tool.name, "run_command");
		assert.equal(tool.status, "completed");
		assert.equal(formatToolArgumentsPreview(tool.arguments), "npm test");
	});

	it("supports pending-confirmation tool calls for interactive approval", () => {
		const pendingTool: UiToolCall = {
			id: "tc-102",
			name: "delete_file",
			arguments: { path: "important.txt" },
			status: "pending-confirmation",
		};

		assert.equal(pendingTool.status, "pending-confirmation");
		assert.equal(formatToolArgumentsPreview(pendingTool.arguments), "important.txt");
	});
});
