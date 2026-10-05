import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { vault } from "../src/crypto/vault.ts";

describe("CryptoVault Passphrase Encryption & Decryption", () => {
	it("encrypts and decrypts payload correctly with the valid passphrase", async () => {
		await vault.init("passphrase", "correct-master-passphrase-123");

		const hostData = {
			name: "Remote Tailscale Host",
			url: "ws://100.64.0.5:38232",
			token: "super-secret-auth-token-xyz",
		};

		const encryptedString = await vault.encrypt(hostData);
		assert.ok(encryptedString, "Encrypted payload should not be null");
		assert.ok(encryptedString.includes("ciphertext"), "Payload should include ciphertext");
		assert.ok(encryptedString.includes("iv"), "Payload should include iv");

		const decrypted = await vault.decrypt<typeof hostData>(encryptedString);
		assert.deepEqual(decrypted, hostData);
	});

	it("returns null when attempting to decrypt with an incorrect passphrase", async () => {
		await vault.init("passphrase", "original-passphrase");
		const data = { secret: "confidential-data" };
		const encrypted = await vault.encrypt(data);
		assert.ok(encrypted);

		// Re-initialize with wrong passphrase
		await vault.init("passphrase", "wrong-passphrase-attempt");
		const failedDecryption = await vault.decrypt<typeof data>(encrypted);
		assert.equal(failedDecryption, null);
	});

	it("returns null in memory-only mode for encryption and decryption", async () => {
		await vault.init("memory-only");
		assert.equal(await vault.encrypt({ test: true }), null);
		assert.equal(await vault.decrypt("anything"), null);
	});
});
