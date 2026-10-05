import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { randomUUID, type CryptoLike, uuidFromBytes } from "../src/crypto/uuid.ts";

const V4_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("uuidFromBytes", () => {
	it("formats 16 zero bytes with correct v4 version and variant bits", () => {
		const id = uuidFromBytes(new Uint8Array(16));
		assert.match(id, V4_UUID_RE);
		assert.equal(id, "00000000-0000-4000-8000-000000000000");
	});

	it("preserves version and variant bits over random entropy", () => {
		for (let i = 0; i < 50; i++) {
			const bytes = new Uint8Array(16);
			crypto.getRandomValues(bytes);
			assert.match(uuidFromBytes(bytes), V4_UUID_RE);
		}
	});
});

describe("randomUUID", () => {
	it("delegates to crypto.randomUUID when available", () => {
		let calls = 0;
		const stub: CryptoLike = {
			getRandomValues: (arr) => globalThis.crypto.getRandomValues(arr),
			randomUUID: () => {
				calls++;
				return "123e4567-e89b-42d3-a456-426614174000";
			},
		};
		assert.equal(randomUUID(stub), "123e4567-e89b-42d3-a456-426614174000");
		assert.equal(calls, 1);
	});

	it("falls back to getRandomValues when randomUUID is missing (insecure context)", () => {
		const stub: CryptoLike = {
			getRandomValues: (arr) => globalThis.crypto.getRandomValues(arr),
		};
		for (let i = 0; i < 50; i++) {
			assert.match(randomUUID(stub), V4_UUID_RE);
		}
	});

	it("generates unique values by default", () => {
		const seen = new Set<string>();
		for (let i = 0; i < 100; i++) {
			seen.add(randomUUID());
		}
		assert.equal(seen.size, 100);
	});
});
