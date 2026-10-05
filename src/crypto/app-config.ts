import type { AppConfiguration, HostConfig } from "../types.ts";
import { vault } from "./vault.ts";

export const VAULT_STORAGE_KEY = "ahp_encrypted_vault";
export const VAULT_MODE_KEY = "ahp_vault_mode";

function isAppConfig(data: AppConfiguration | HostConfig): data is AppConfiguration {
	return typeof data === "object" && data !== null && "currentHost" in data;
}

/**
 * Checks whether encrypted configuration data exists in local storage.
 */
export function hasStoredVault(): boolean {
	if (typeof localStorage === "undefined") return false;
	try {
		return Boolean(localStorage.getItem(VAULT_STORAGE_KEY));
	} catch {
		return false;
	}
}

/**
 * Clears stored encrypted configuration from local storage.
 */
export function clearStoredVault(): void {
	if (typeof localStorage === "undefined") return;
	try {
		localStorage.removeItem(VAULT_STORAGE_KEY);
		localStorage.removeItem(VAULT_MODE_KEY);
	} catch {
		// Ignore local storage errors
	}
}

/**
 * Encrypts and saves the complete application configuration into local storage.
 */
export async function saveAppConfiguration(config: AppConfiguration, passphrase: string): Promise<boolean> {
	if (typeof localStorage === "undefined") return false;
	await vault.init("passphrase", passphrase);
	const encrypted = await vault.encrypt(config);
	if (!encrypted) return false;

	try {
		localStorage.setItem(VAULT_STORAGE_KEY, encrypted);
		localStorage.setItem(VAULT_MODE_KEY, "passphrase");
		return true;
	} catch (err) {
		console.warn("Failed to write encrypted configuration to local storage:", err);
		return false;
	}
}

/**
 * Derives the key from the provided passphrase and decrypts the stored configuration.
 * Returns null if the passphrase is incorrect or decryption fails.
 */
export async function unlockAppConfiguration(passphrase: string): Promise<AppConfiguration | null> {
	if (typeof localStorage === "undefined") return null;

	let encrypted: string | null = null;
	try {
		encrypted = localStorage.getItem(VAULT_STORAGE_KEY);
	} catch {
		return null;
	}

	if (!encrypted) return null;

	await vault.init("passphrase", passphrase);
	const raw = await vault.decrypt<AppConfiguration | HostConfig>(encrypted);
	if (!raw) return null;

	if (isAppConfig(raw)) {
		if (!raw.savedHosts || raw.savedHosts.length === 0) {
			raw.savedHosts = [raw.currentHost];
		}
		return raw;
	}

	// Backward compatibility: if the vault previously stored a raw HostConfig
	return {
		version: 1,
		currentHost: raw,
		savedHosts: [raw],
		lastSavedAt: new Date().toISOString(),
	};
}
