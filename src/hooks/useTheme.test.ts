import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { getSystemTheme } from "./useTheme.ts";

interface MockGlobal {
	window?: {
		matchMedia?: (query: string) => { matches: boolean };
	};
}

const g = globalThis as MockGlobal;

describe("Theme Detection (useTheme / getSystemTheme)", () => {
	const originalWindow = g.window;

	afterEach(() => {
		g.window = originalWindow;
	});

	it("defaults to dark mode when window is undefined or matchMedia is not available", () => {
		g.window = undefined;
		const result = getSystemTheme();
		assert.equal(result, "dark", "should default to dark mode");
	});

	it("returns light mode when system prefers light", () => {
		g.window = {
			matchMedia: (query: string) => ({
				matches: query === "(prefers-color-scheme: light)",
			}),
		};

		const result = getSystemTheme();
		assert.equal(result, "light", "should detect light mode from system query");
	});

	it("returns dark mode when system prefers dark", () => {
		g.window = {
			matchMedia: (query: string) => ({
				matches: query === "(prefers-color-scheme: dark)",
			}),
		};

		const result = getSystemTheme();
		assert.equal(result, "dark", "should detect dark mode from system query");
	});

	it("defaults to dark mode when system provides no preference or non-matching scheme", () => {
		g.window = {
			matchMedia: (_query: string) => ({
				matches: false,
			}),
		};

		const result = getSystemTheme();
		assert.equal(result, "dark", "should fall back to dark mode by default");
	});
});
