import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDirectoryBase, formatDirectoryTooltip } from "../src/utils/format-session-dir.ts";

describe("formatDirectoryBase", () => {
	it("extracts the folder name from standard Unix paths", () => {
		assert.equal(formatDirectoryBase("/Users/test/workspace/agent-ui"), "agent-ui");
		assert.equal(formatDirectoryBase("/var/www/html"), "html");
	});

	it("safely handles trailing slashes without returning an empty string", () => {
		assert.equal(formatDirectoryBase("/Users/test/workspace/agent-ui/"), "agent-ui");
		assert.equal(formatDirectoryBase("/home/developer/repos///"), "repos");
	});

	it("safely handles Windows-style backslashes", () => {
		assert.equal(formatDirectoryBase("C:\\Users\\test\\project"), "project");
		assert.equal(formatDirectoryBase("C:\\Users\\test\\project\\"), "project");
	});

	it("handles root paths gracefully", () => {
		assert.equal(formatDirectoryBase("/"), "/");
		assert.equal(formatDirectoryBase("\\"), "\\");
	});

	it("falls back to 'workspace' when path is empty or undefined", () => {
		assert.equal(formatDirectoryBase(""), "workspace");
		assert.equal(formatDirectoryBase("   "), "workspace");
		assert.equal(formatDirectoryBase(undefined), "workspace");
	});
});

describe("formatDirectoryTooltip", () => {
	it("returns full trimmed directory path", () => {
		assert.equal(formatDirectoryTooltip("/Users/test/workspace/project"), "/Users/test/workspace/project");
		assert.equal(formatDirectoryTooltip("  /var/log  "), "/var/log");
	});

	it("provides friendly fallback when empty or undefined", () => {
		assert.equal(formatDirectoryTooltip(""), "No directory specified");
		assert.equal(formatDirectoryTooltip(undefined), "No directory specified");
	});
});
