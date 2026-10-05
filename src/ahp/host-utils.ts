import type { HostConfig } from "../types.ts";

export interface LocationLike {
	hostname: string;
	protocol: string;
}

/**
 * Derives the initial default HostConfig based on the current window location.
 *
 * When accessed from localhost or 127.0.0.1, defaults to ws://127.0.0.1:63877.
 * When accessed from a network IP or domain (e.g. from a mobile phone or remote LAN device),
 * defaults to the same hostname (ws://<hostname>:63877) instead of 127.0.0.1, preventing
 * clients from attempting to connect to their own local loopback.
 * When accessed over HTTPS, defaults to wss:// to avoid Mixed Content blocks.
 */
export function getDefaultHost(loc?: LocationLike): HostConfig {
	const location = loc || (typeof window !== "undefined" ? window.location : undefined);
	const hostname = location?.hostname || "127.0.0.1";
	const isHttps = location?.protocol === "https:";
	const proto = isHttps ? "wss://" : "ws://";

	const isLocal =
		hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "0.0.0.0" || !hostname;

	if (!isLocal) {
		return {
			id: "default-local-host",
			name: `AHP Host (${hostname})`,
			url: `${proto}${hostname}:63877`,
			isDefault: true,
		};
	}

	return {
		id: "default-local-host",
		name: "Local pi-agent-host",
		url: `${proto}127.0.0.1:63877`,
		isDefault: true,
	};
}

/**
 * Returns user-facing diagnostic guidance when a WebSocket connection to an AHP host fails.
 */
export function formatHostConnectionError(
	targetUrl: string,
	rawError?: string,
	loc?: LocationLike,
): { title: string; message: string; guidance?: string } {
	const location = loc || (typeof window !== "undefined" ? window.location : undefined);
	const currentHostname = location?.hostname || "";
	const isHttps = location?.protocol === "https:";
	const isWsTarget = targetUrl.startsWith("ws://");

	const isNonLocalOrigin =
		Boolean(currentHostname) &&
		currentHostname !== "localhost" &&
		currentHostname !== "127.0.0.1" &&
		currentHostname !== "::1";

	const isLoopbackTarget = targetUrl.includes("127.0.0.1") || targetUrl.includes("localhost");

	let guidance: string | undefined;

	if (isHttps && isWsTarget) {
		guidance =
			"Mixed Content Notice: This UI is served over HTTPS, which prevents modern browsers from connecting to unencrypted ws:// endpoints. Connect via wss:// or serve the UI over HTTP.";
	} else if (isNonLocalOrigin && isLoopbackTarget) {
		guidance =
			`Loopback Address Notice: You are accessing this UI from a network address (${currentHostname}), but the target URL (${targetUrl}) points to loopback (127.0.0.1). ` +
			`On client devices (such as mobile phones), 127.0.0.1 refers to the client device itself, not your host workstation. ` +
			`Use ws://${currentHostname}:63877 instead, and ensure your AHP host was started with --host 0.0.0.0.`;
	} else if (isNonLocalOrigin) {
		guidance =
			"Network Access Tip: When connecting from another device on your network, ensure the AHP server (e.g. pi-agent-host-protocol) is listening on all interfaces with --host 0.0.0.0, rather than the default 127.0.0.1.";
	}

	const errorDetail = rawError ? ` (${rawError})` : "";
	return {
		title: "Connection Failed",
		message: `Could not connect to ${targetUrl}${errorDetail}`,
		guidance,
	};
}
