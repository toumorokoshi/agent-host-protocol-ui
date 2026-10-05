import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { multiAhp, MultiAhpManager } from "../src/ahp/multi-connection.ts";
import {
	clearStoredVault,
	hasStoredVault,
	saveAppConfiguration,
	unlockAppConfiguration,
} from "../src/crypto/app-config.ts";
import type { AppConfiguration, HostConfig, UiSession } from "../src/types.ts";
import { extractDirectoryOptions } from "../src/utils/directory-options.ts";

describe("Multi-AHP Host Sessions & Passphrase Vault Persistence", () => {
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

	it("encrypts multiple AHP host configurations and unlocks all of them behind the same passphrase", async () => {
		const masterPassphrase = "shared-master-passphrase-secure-123";

		const host1: HostConfig = {
			id: "host-localhost",
			name: "Workstation Localhost",
			url: "ws://127.0.0.1:63877",
			token: "local-token-abc",
			defaultDirectory: "/Users/user/workspace/agent-host",
			models: [
				{ id: "anthropic/claude-3-7-sonnet", displayName: "Claude 3.7", provider: "anthropic", supportsThinking: true },
				{ id: "pi", displayName: "Pi Default", provider: "pi", supportsThinking: true },
			],
		};

		const host2: HostConfig = {
			id: "host-tailscale",
			name: "Remote Tailscale Machine",
			url: "ws://100.82.1.2:38232",
			token: "tailscale-token-xyz",
			defaultDirectory: "/home/yusuke/projects/backend",
			models: [
				{ id: "openai/gpt-4o", displayName: "GPT-4o", provider: "openai", supportsThinking: true },
				{ id: "meta/llama-3.3-70b", displayName: "Llama 3.3", provider: "meta", supportsThinking: true },
			],
		};

		const config: AppConfiguration = {
			version: 1,
			currentHost: host1,
			savedHosts: [host1, host2],
			themePreference: "dark",
			lastSavedAt: new Date().toISOString(),
		};

		// Save complete configuration behind passphrase
		const saved = await saveAppConfiguration(config, masterPassphrase);
		assert.equal(saved, true);
		assert.equal(hasStoredVault(), true);

		// Unlock with correct passphrase
		const unlocked = await unlockAppConfiguration(masterPassphrase);
		assert.ok(unlocked);
		assert.equal(unlocked?.savedHosts?.length, 2);

		const restoredHost1 = unlocked?.savedHosts?.find((h) => h.id === "host-localhost");
		assert.ok(restoredHost1);
		assert.equal(restoredHost1?.name, "Workstation Localhost");
		assert.equal(restoredHost1?.token, "local-token-abc");
		assert.equal(restoredHost1?.defaultDirectory, "/Users/user/workspace/agent-host");
		assert.equal(restoredHost1?.models?.length, 2);

		const restoredHost2 = unlocked?.savedHosts?.find((h) => h.id === "host-tailscale");
		assert.ok(restoredHost2);
		assert.equal(restoredHost2?.name, "Remote Tailscale Machine");
		assert.equal(restoredHost2?.token, "tailscale-token-xyz");
		assert.equal(restoredHost2?.defaultDirectory, "/home/yusuke/projects/backend");
		assert.equal(restoredHost2?.models?.length, 2);

		// Re-encrypt with updated host list using the same passphrase
		const host3: HostConfig = {
			id: "host-cloud",
			name: "Cloud GPU Box",
			url: "wss://gpu.internal.cloud:8443",
			token: "gpu-token-999",
			defaultDirectory: "/workspace/gpu-worker",
		};
		config.savedHosts = [host1, host2, host3];
		const updatedSaved = await saveAppConfiguration(config, masterPassphrase);
		assert.equal(updatedSaved, true);

		const unlockedUpdated = await unlockAppConfiguration(masterPassphrase);
		assert.equal(unlockedUpdated?.savedHosts?.length, 3);
		assert.ok(unlockedUpdated?.savedHosts?.some((h) => h.id === "host-cloud"));
	});

	it("populates working directories correctly filtered by selected AHP host", () => {
		const hostAId = "host-a";
		const hostBId = "host-b";

		const sessions: UiSession[] = [
			{
				id: "sess-1",
				title: "Session 1 on Host A",
				workingDirectory: "/home/user/host-a-app",
				modifiedAt: new Date(Date.now() - 10000).toISOString(),
				isLive: true,
				isArchived: false,
				model: "pi",
				thinkingLevel: "high",
				turns: [],
				queuedMessages: [],
				skills: [],
				hostId: hostAId,
				hostName: "Host A",
			},
			{
				id: "sess-2",
				title: "Session 2 on Host B",
				workingDirectory: "/var/www/host-b-service",
				modifiedAt: new Date(Date.now() - 5000).toISOString(),
				isLive: false,
				isArchived: false,
				model: "gpt-4o",
				thinkingLevel: "high",
				turns: [],
				queuedMessages: [],
				skills: [],
				hostId: hostBId,
				hostName: "Host B",
			},
		];

		// When selecting Host A: only Host A sessions and default dir are populated
		const hostADefaultDir = "/home/user/default-a";
		const hostASessions = sessions.filter((s) => !s.hostId || s.hostId === hostAId);
		const optionsA = extractDirectoryOptions(hostADefaultDir, hostASessions);

		assert.ok(optionsA.some((opt) => opt.path === "/home/user/default-a"));
		assert.ok(optionsA.some((opt) => opt.path === "/home/user/host-a-app"));
		assert.ok(!optionsA.some((opt) => opt.path === "/var/www/host-b-service"));

		// When selecting Host B: only Host B sessions and default dir are populated
		const hostBDefaultDir = "/var/www/default-b";
		const hostBSessions = sessions.filter((s) => !s.hostId || s.hostId === hostBId);
		const optionsB = extractDirectoryOptions(hostBDefaultDir, hostBSessions);

		assert.ok(optionsB.some((opt) => opt.path === "/var/www/default-b"));
		assert.ok(optionsB.some((opt) => opt.path === "/var/www/host-b-service"));
		assert.ok(!optionsB.some((opt) => opt.path === "/home/user/host-a-app"));
	});

	it("manages connection registry in MultiAhpManager cleanly", () => {
		const manager = new MultiAhpManager();
		const hostConfig: HostConfig = {
			id: "test-mgr-host",
			name: "Test Host",
			url: "ws://127.0.0.1:63877",
		};

		const conn1 = manager.getOrCreateConnection(hostConfig);
		assert.ok(conn1);
		const conn2 = manager.getOrCreateConnection(hostConfig);
		assert.equal(conn1, conn2, "Should return existing connection for same host id");

		assert.equal(manager.getHostStatus(hostConfig.id), "disconnected");

		manager.disconnectHost(hostConfig.id);
		assert.equal(manager.getConnection(hostConfig.id), undefined);
	});
});
