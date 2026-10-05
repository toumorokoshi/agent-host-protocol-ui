/**
 * Client-Side Web Crypto API Vault
 * Provides AES-GCM-256 encryption at rest for sensitive local storage items
 * (tokens, host configs, session drafts, cached history).
 */

export interface EncryptedPayload {
	iv: string; // base64
	salt?: string; // base64 (for passphrase-derived keys)
	ciphertext: string; // base64
}

export type StoragePrivacyMode = "ephemeral" | "passphrase" | "memory-only";

class CryptoVault {
	private activeKey: CryptoKey | null = null;
	private mode: StoragePrivacyMode = "ephemeral";

	/**
	 * Initializes the vault. In 'ephemeral' mode, generates a secure random 256-bit key
	 * in memory. In 'memory-only' mode, no disk storage will be written.
	 */
	async init(mode: StoragePrivacyMode = "ephemeral", passphrase?: string): Promise<void> {
		this.mode = mode;
		if (mode === "memory-only") {
			this.activeKey = null;
			return;
		}

		if (!this.webCryptoAvailable()) {
			// crypto.subtle is only exposed in secure contexts (HTTPS or
			// localhost). Degrade to memory-only mode so the app stays fully
			// functional when served over plain HTTP (e.g., LAN / mobile
			// testing); encryption at rest is simply unavailable there.
			console.warn(
				"Web Crypto (crypto.subtle) unavailable in insecure context; vault degraded to memory-only mode. " +
					"Use HTTPS or localhost to enable encrypted persistence.",
			);
			this.mode = "memory-only";
			this.activeKey = null;
			return;
		}

		if (mode === "ephemeral") {
			this.activeKey = await crypto.subtle.generateKey(
				{ name: "AES-GCM", length: 256 },
				false, // non-extractable
				["encrypt", "decrypt"],
			);
		} else if (mode === "passphrase" && passphrase) {
			this.activeKey = await this.deriveKeyFromPassphrase(passphrase, this.getOrCreateSalt());
		}
	}

	getMode(): StoragePrivacyMode {
		return this.mode;
	}

	isReady(): boolean {
		return this.mode === "memory-only" || this.activeKey !== null;
	}

	private webCryptoAvailable(): boolean {
		return typeof crypto !== "undefined" && typeof crypto.subtle?.generateKey === "function";
	}

	private getOrCreateSalt(): Uint8Array {
		const stored = localStorage.getItem("ahp_ui_salt");
		if (stored) {
			const bin = atob(stored);
			const arr = new Uint8Array(bin.length);
			for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
			return arr;
		}
		const newSalt = crypto.getRandomValues(new Uint8Array(16));
		let bin = "";
		for (let i = 0; i < newSalt.length; i++) bin += String.fromCharCode(newSalt[i]);
		localStorage.setItem("ahp_ui_salt", btoa(bin));
		return newSalt;
	}

	private async deriveKeyFromPassphrase(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
		const enc = new TextEncoder();
		const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(passphrase), { name: "PBKDF2" }, false, [
			"deriveKey",
		]);

		return crypto.subtle.deriveKey(
			{
				name: "PBKDF2",
				salt: salt.buffer as ArrayBuffer,
				iterations: 600000,
				hash: "SHA-256",
			},
			keyMaterial,
			{ name: "AES-GCM", length: 256 },
			false,
			["encrypt", "decrypt"],
		);
	}

	async encrypt(data: unknown): Promise<string | null> {
		if (this.mode === "memory-only" || !this.activeKey) {
			return null;
		}

		const iv = crypto.getRandomValues(new Uint8Array(12));
		const jsonStr = JSON.stringify(data);
		const enc = new TextEncoder();
		const encoded = enc.encode(jsonStr);

		const ciphertextBuf = await crypto.subtle.encrypt(
			{ name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
			this.activeKey,
			encoded,
		);

		const payload: EncryptedPayload = {
			iv: this.arrayBufferToBase64(iv),
			ciphertext: this.arrayBufferToBase64(new Uint8Array(ciphertextBuf)),
		};

		return JSON.stringify(payload);
	}

	async decrypt<T>(serializedPayload: string): Promise<T | null> {
		if (this.mode === "memory-only" || !this.activeKey) {
			return null;
		}

		try {
			const payload: EncryptedPayload = JSON.parse(serializedPayload);
			const iv = this.base64ToArrayBuffer(payload.iv);
			const ciphertext = this.base64ToArrayBuffer(payload.ciphertext);

			const decrypted = await crypto.subtle.decrypt(
				{ name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
				this.activeKey,
				ciphertext.buffer as ArrayBuffer,
			);

			const dec = new TextDecoder();
			return JSON.parse(dec.decode(decrypted)) as T;
		} catch (err) {
			console.warn("Failed to decrypt data from vault:", err);
			return null;
		}
	}

	private arrayBufferToBase64(buffer: Uint8Array): string {
		let binary = "";
		for (let i = 0; i < buffer.byteLength; i++) {
			binary += String.fromCharCode(buffer[i]);
		}
		return btoa(binary);
	}

	private base64ToArrayBuffer(base64: string): Uint8Array {
		const binary = atob(base64);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return bytes;
	}
}

export const vault = new CryptoVault();
