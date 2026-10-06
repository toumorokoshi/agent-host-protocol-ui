import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatHostConnectionError, formatIpv6Url, getDefaultHost } from "../src/ahp/host-utils.ts";

describe("getDefaultHost", () => {
	it("returns ws://127.0.0.1:63877 on localhost", () => {
		const host = getDefaultHost({ hostname: "localhost", protocol: "http:" });
		assert.equal(host.url, "ws://127.0.0.1:63877");
		assert.equal(host.name, "Local pi-agent-host");
	});

	it("returns ws://127.0.0.1:63877 on 127.0.0.1", () => {
		const host = getDefaultHost({ hostname: "127.0.0.1", protocol: "http:" });
		assert.equal(host.url, "ws://127.0.0.1:63877");
	});

	it("returns ws://127.0.0.1:63877 on IPv6 loopback [::1]", () => {
		const host = getDefaultHost({ hostname: "[::1]", protocol: "http:" });
		assert.equal(host.url, "ws://127.0.0.1:63877");
	});

	it("adapts to network IP when accessed remotely", () => {
		const host = getDefaultHost({ hostname: "10.0.0.148", protocol: "http:" });
		assert.equal(host.url, "ws://10.0.0.148:63877");
		assert.equal(host.name, "AHP Host (10.0.0.148)");
	});

	it("adapts to IPv6 address when accessed remotely", () => {
		const host = getDefaultHost({ hostname: "[fd7a:115c:a1e0::1]", protocol: "http:" });
		assert.equal(host.url, "ws://[fd7a:115c:a1e0::1]:63877");
	});

	it("adapts to custom domain when accessed remotely", () => {
		const host = getDefaultHost({ hostname: "agent.internal", protocol: "http:" });
		assert.equal(host.url, "ws://agent.internal:63877");
	});

	it("uses wss:// on HTTPS localhost", () => {
		const host = getDefaultHost({ hostname: "localhost", protocol: "https:" });
		assert.equal(host.url, "wss://127.0.0.1:63877");
	});

	it("uses wss:// on HTTPS remote origin", () => {
		const host = getDefaultHost({ hostname: "agent.example.com", protocol: "https:" });
		assert.equal(host.url, "wss://agent.example.com:63877");
	});
});

describe("formatIpv6Url", () => {
	it("wraps unbracketed IPv6 URL with port in RFC 3986 brackets", () => {
		assert.equal(
			formatIpv6Url("ws://fd7a:115c:a1e0::1a36:d761:63877"),
			"ws://[fd7a:115c:a1e0::1a36:d761]:63877",
		);
	});

	it("preserves query parameters and tokens on unbracketed IPv6", () => {
		assert.equal(
			formatIpv6Url("ws://fd7a:115c:a1e0::1a36:d761:63877?tkn=mytoken"),
			"ws://[fd7a:115c:a1e0::1a36:d761]:63877?tkn=mytoken",
		);
	});

	it("wraps raw unbracketed IPv6 host without protocol", () => {
		assert.equal(
			formatIpv6Url("fd7a:115c:a1e0::1a36:d761:63877"),
			"[fd7a:115c:a1e0::1a36:d761]:63877",
		);
	});

	it("leaves already bracketed IPv6 unchanged", () => {
		assert.equal(
			formatIpv6Url("ws://[fd7a:115c:a1e0::1a36:d761]:63877"),
			"ws://[fd7a:115c:a1e0::1a36:d761]:63877",
		);
	});

	it("leaves IPv4 addresses unchanged", () => {
		assert.equal(formatIpv6Url("ws://127.0.0.1:63877"), "ws://127.0.0.1:63877");
		assert.equal(formatIpv6Url("http://100.106.215.96:5173"), "http://100.106.215.96:5173");
	});
});

describe("formatHostConnectionError", () => {
	it("diagnoses loopback target accessed from network address", () => {
		const diag = formatHostConnectionError(
			"ws://127.0.0.1:63877",
			"websocket failed to open",
			{ hostname: "10.0.0.148", protocol: "http:" },
		);
		assert.ok(diag.guidance?.includes("Loopback Address Notice"));
		assert.ok(diag.guidance?.includes("10.0.0.148"));
		assert.ok(diag.guidance?.includes("--host 0.0.0.0"));
	});

	it("diagnoses mixed content when accessed over HTTPS", () => {
		const diag = formatHostConnectionError(
			"ws://10.0.0.148:63877",
			"SecurityError",
			{ hostname: "agent.example.com", protocol: "https:" },
		);
		assert.ok(diag.guidance?.includes("Mixed Content Notice"));
	});

	it("diagnoses Tailscale mixed content on *.ts.net with actionable resolution steps", () => {
		const diag = formatHostConnectionError(
			"ws://my-box.tailnet.ts.net:63877",
			"Failed to construct 'WebSocket': An insecure WebSocket connection may not be initiated from a page loaded over HTTPS.",
			{ hostname: "my-box.tailnet.ts.net", protocol: "https:" },
		);
		assert.ok(diag.guidance?.includes("Tailscale Mixed Content Notice"));
		assert.ok(diag.guidance?.includes("http://100.x.y.z:5173"));
		assert.ok(diag.guidance?.includes("tailscale serve"));
		assert.ok(diag.guidance?.includes("wss://my-box.tailnet.ts.net:8443"));
		assert.ok(diag.guidance?.includes("wss://my-box.tailnet.ts.net/ws"));
	});

	it("diagnoses network IP target with general host advice", () => {
		const diag = formatHostConnectionError(
			"ws://10.0.0.148:63877",
			"websocket failed to open",
			{ hostname: "10.0.0.148", protocol: "http:" },
		);
		assert.ok(diag.guidance?.includes("Network Access Tip"));
		assert.ok(diag.guidance?.includes("--host 0.0.0.0"));
	});

	it("has no special guidance when failing on pure localhost without mixed content", () => {
		const diag = formatHostConnectionError(
			"ws://127.0.0.1:63877",
			"websocket failed to open",
			{ hostname: "localhost", protocol: "http:" },
		);
		assert.equal(diag.guidance, undefined);
	});
});
