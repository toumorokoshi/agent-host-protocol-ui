import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
	clearStoredVault,
	hasStoredVault,
	saveAppConfiguration,
	unlockAppConfiguration,
	VAULT_STORAGE_KEY,
} from "../src/crypto/app-config.ts";
import { vault } from "../src/crypto/vault.ts";
import type { AppConfiguration, HostConfig } from "../src/types.ts";

describe("App Configuration Vault Persistence & Unlock", () => {
	// Setup in-memory mock localStorage if running in Node test runner
	const memoryStore = new Map<string, string>();

	beforeEach(() => {
		memoryStore.clear();
		if (typeof globalThis.localStorage === "undefined") {
			globalThis.localStorage = {
				getItem: (key: string) => memoryStore.get(key) ?? null,
				setItem: (key: string, val: string) => memoryStore.set(key, String(val)),
				removeItem: (key: string) => memoryStore.delete(key),
				clear: () => memoryStore.clear(),
				key: (i: number) => Array.from(memoryStore.keys())[i] ?? null,
				get length() {
					return memoryStore.size;
				},
			} as Storage;
		} else {
			globalThis.localStorage.clear();
		}
	});

	it("returns false for hasStoredVault when nothing is stored", () => {
		assert.equal(hasStoredVault(), false);
	});

	it("saves full AppConfiguration and unlocks it via passphrase", async () => {
		const config: AppConfiguration = {
			version: 1,
			currentHost: {
				id: "remote-ts",
				name: "Tailscale Machine",
				url: "ws://100.115.92.2:38232",
				token: "auth-token-12345",
			},
			themePreference: "dark",
			lastSavedAt: new Date().toISOString(),
		};

		const saved = await saveAppConfiguration(config, "my-master-password");
		assert.equal(saved, true);
		assert.equal(hasStoredVault(), true);

		// Unlock with correct password
		const unlocked = await unlockAppConfiguration("my-master-password");
		assert.ok(unlocked);
		assert.equal(unlocked?.version, 1);
		assert.equal(unlocked?.currentHost.url, "ws://100.115.92.2:38232");
		assert.equal(unlocked?.currentHost.token, "auth-token-12345");
		assert.equal(unlocked?.themePreference, "dark");
	});

	it("fails to unlock and returns null with incorrect passphrase", async () => {
		const config: AppConfiguration = {
			version: 1,
			currentHost: {
				id: "local",
				name: "Local",
				url: "ws://127.0.0.1:63877",
			},
		};

		await saveAppConfiguration(config, "correct-password");
		const failed = await unlockAppConfiguration("wrong-password");
		assert.equal(failed, null);
	});

	it("seamlessly handles backward compatibility with legacy HostConfig payload", async () => {
		// Simulate older vault payload that stored raw HostConfig instead of AppConfiguration
		await vault.init("passphrase", "legacy-passphrase");
		const legacyHost: HostConfig = {
			id: "legacy-host",
			name: "Legacy Host",
			url: "ws://10.0.0.5:63877",
			token: "legacy-token",
		};
		const legacyEncrypted = await vault.encrypt(legacyHost);
		assert.ok(legacyEncrypted);
		globalThis.localStorage.setItem(VAULT_STORAGE_KEY, legacyEncrypted);

		const unlocked = await unlockAppConfiguration("legacy-passphrase");
		assert.ok(unlocked);
		assert.equal(unlocked?.version, 1);
		assert.equal(unlocked?.currentHost.url, "ws://10.0.0.5:63877");
		assert.equal(unlocked?.currentHost.token, "legacy-token");
	});

	it("clears stored vault upon clearStoredVault()", async () => {
		const config: AppConfiguration = {
			version: 1,
			currentHost: {
				id: "local",
				name: "Local",
				url: "ws://127.0.0.1:63877",
			},
		};
		await saveAppConfiguration(config, "password");
		assert.equal(hasStoredVault(), true);

		clearStoredVault();
		assert.equal(hasStoredVault(), false);
	});

	it("preserves multiple saved hosts and active host across passphrase unlock", async () => {
		const host1: HostConfig = {
			id: "host-1",
			name: "Workstation Host",
			url: "ws://192.168.1.50:63877",
			token: "work-tok-999",
		};
		const host2: HostConfig = {
			id: "host-2",
			name: "Cloud Server",
			url: "wss://agent.example.com/ws",
			token: "cloud-tok-888",
		};

		const config: AppConfiguration = {
			version: 1,
			currentHost: host1,
			savedHosts: [host1, host2],
			themePreference: "dark",
			lastSavedAt: new Date().toISOString(),
		};

		await saveAppConfiguration(config, "strong-passphrase-123");
		assert.equal(hasStoredVault(), true);

		const restored = await unlockAppConfiguration("strong-passphrase-123");
		assert.ok(restored);
		assert.equal(restored?.currentHost.url, "ws://192.168.1.50:63877");
		assert.equal(restored?.currentHost.token, "work-tok-999");
		assert.equal(restored?.savedHosts?.length, 2);
		assert.equal(restored?.savedHosts?.[1].url, "wss://agent.example.com/ws");
		assert.equal(restored?.savedHosts?.[1].token, "cloud-tok-888");
	});
});
