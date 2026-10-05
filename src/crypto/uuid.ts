/**
 * Secure-context-resilient UUID helper.
 *
 * `crypto.randomUUID()` is only exposed in secure contexts (HTTPS or
 * localhost). When the UI is served over plain HTTP (e.g., LAN / mobile
 * testing), it falls back to assembling a spec-compliant v4 UUID from
 * `crypto.getRandomValues`, which is available in all contexts.
 */

export interface CryptoLike {
	getRandomValues<T extends Exclude<BufferSource, ArrayBuffer>>(array: T): T;
	randomUUID?: () => string;
}

/**
 * Format 16 random bytes as a canonical RFC 9562 version 4 UUID string,
 * setting the version and variant bits.
 */
export function uuidFromBytes(bytes: Uint8Array): string {
	const b = new Uint8Array(16);
	b.set(bytes.subarray(0, 16));
	b[6] = (b[6] & 0x0f) | 0x40;
	b[8] = (b[8] & 0x3f) | 0x80;
	const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Return a random UUID v4, preferring the native `crypto.randomUUID()`
 * and falling back to `crypto.getRandomValues` in non-secure contexts.
 */
export function randomUUID(cryptoObj: CryptoLike = globalThis.crypto): string {
	if (typeof cryptoObj.randomUUID === "function") {
		return cryptoObj.randomUUID();
	}
	return uuidFromBytes(cryptoObj.getRandomValues(new Uint8Array(16)));
}
