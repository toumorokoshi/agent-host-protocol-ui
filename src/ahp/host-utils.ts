import type { HostConfig } from "../types.ts";

export interface LocationLike {
	hostname: string;
	protocol: string;
}

/**
 * Ensures literal IPv6 addresses in URLs are wrapped in square brackets per RFC 3986.
 * e.g., "ws://fd7a:115c::1:63877" -> "ws://[fd7a:115c::1]:63877"
 * e.g., "fd7a:115c::1:63877" -> "[fd7a:115c::1]:63877"
 * e.g., "::1" -> "[::1]"
 */
export function formatIpv6Url(rawUrl: string): string {
	if (!rawUrl || (rawUrl.includes("[") && rawUrl.includes("]"))) return rawUrl;
	const protoMatch = rawUrl.match(/^(wss?:\/\/|https?:\/\/)/);
	const proto = protoMatch ? protoMatch[0] : "";
	const rest = rawUrl.slice(proto.length);
	const [hostPort, ...pathRest] = rest.split(/(?=[/?#])/);
	const pathSuffix = pathRest.join("");

	const colons = (hostPort.match(/:/g) || []).length;
	if (colons >= 2) {
		const lastColon = hostPort.lastIndexOf(":");
		const afterLastColon = hostPort.slice(lastColon + 1);
		// If last segment is a numeric port (1-65535) and preceding part has at least 2 colons:
		if (/^\d{1,5}$/.test(afterLastColon) && (hostPort.slice(0, lastColon).match(/:/g) || []).length >= 2) {
			const ip = hostPort.slice(0, lastColon);
			return `${proto}[${ip}]:${afterLastColon}${pathSuffix}`;
		}
		return `${proto}[${hostPort}]${pathSuffix}`;
	}
	return rawUrl;
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
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname === "::1" ||
		hostname === "[::1]" ||
		hostname === "0.0.0.0" ||
		!hostname;

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
	const isMixedContent =
		(isHttps && isWsTarget) ||
		Boolean(rawError && /insecure websocket|mixed content|page loaded over https/i.test(rawError));

	const isNonLocalOrigin =
		Boolean(currentHostname) &&
		currentHostname !== "localhost" &&
		currentHostname !== "127.0.0.1" &&
		currentHostname !== "::1" &&
		currentHostname !== "[::1]";

	const isLoopbackTarget =
		targetUrl.includes("127.0.0.1") || targetUrl.includes("localhost") || targetUrl.includes("::1");
	const isTailscale =
		currentHostname.includes(".ts.net") ||
		targetUrl.includes(".ts.net") ||
		currentHostname.startsWith("100.") ||
		targetUrl.includes("100.");

	let guidance: string | undefined;

	if (isMixedContent) {
		if (isTailscale) {
			const tsHost = currentHostname || "your-device.ts.net";
			guidance =
				"Tailscale Mixed Content Notice: Browsers block unencrypted ws:// connections when this UI is loaded over HTTPS (*.ts.net).\n\n" +
				"To resolve this, choose one of these solutions:\n" +
				"1. Easiest: Access this UI over plain HTTP via your Tailscale IP (e.g. http://100.x.y.z:5173) instead of https://*.ts.net. Tailscale WireGuard encrypts all traffic end-to-end, and HTTP pages allow ws:// connections.\n" +
				`2. Tailscale Serve WSS: Configure Tailscale Serve to terminate TLS for your AHP host:\n` +
				`   tailscale serve --bg https:8443 / http://127.0.0.1:63877\n` +
				`   Then connect to: wss://${tsHost}:8443\n` +
				`3. CLI Proxy: If serving via the CLI runner, connect to wss://${tsHost}/ws.`;
		} else {
			guidance =
				"Mixed Content Notice: This UI is served over HTTPS, which prevents modern browsers from connecting to unencrypted ws:// endpoints.\n\n" +
				"To resolve this:\n" +
				"1. Connect via wss:// backed by a TLS reverse proxy (e.g. Tailscale Serve, Caddy, or Nginx).\n" +
				"2. Or serve and access the UI over plain HTTP, where ws:// is permitted.";
		}
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
