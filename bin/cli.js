#!/usr/bin/env node

import { exec } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "../dist");

const MIME_TYPES = {
	".html": "text/html; charset=utf-8",
	".js": "application/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".ico": "image/x-icon",
	".woff": "font/woff",
	".woff2": "font/woff2",
};

function getNetworkIps() {
	const ips = [];
	try {
		const interfaces = os.networkInterfaces();
		for (const name of Object.keys(interfaces)) {
			const netInterface = interfaces[name];
			if (!netInterface) continue;
			for (const iface of netInterface) {
				if (iface.family === "IPv4" && !iface.internal) {
					ips.push(iface.address);
				}
			}
		}
	} catch {
		// ignore network interface errors
	}
	return ips;
}

// Parse command line arguments
const args = process.argv.slice(2);
let port = 5173;
let listenHost = "localhost";
let autoOpen = true;
let agentHostParam = "";

for (let i = 0; i < args.length; i++) {
	const arg = args[i];
	if (arg === "--port" || arg === "-p") {
		port = Number.parseInt(args[++i], 10) || 5173;
	} else if (arg === "--no-open") {
		autoOpen = false;
	} else if (arg === "--bind" || arg === "-b" || arg === "--hostname" || arg === "--listen") {
		listenHost = args[++i] || "0.0.0.0";
	} else if (arg === "--host" || arg === "-h") {
		const next = args[i + 1];
		if (!next || next.startsWith("-")) {
			// Flag present without value: bind to 0.0.0.0 (like Vite --host)
			listenHost = "0.0.0.0";
		} else {
			i++;
			if (next.startsWith("ws://") || next.startsWith("wss://")) {
				agentHostParam = next;
			} else {
				listenHost = next;
			}
		}
	} else if (arg === "--agent-host" || arg === "--ws" || arg === "-a") {
		agentHostParam = args[++i] || "";
	} else if (arg === "--help") {
		console.log(`
agent-host-protocol-ui - Client-side UI for Agent Host Protocol

Usage:
  npx agent-host-protocol-ui [options]

Options:
  -b, --bind <address>       Hostname/IP to listen on (e.g. 0.0.0.0 or localhost, default: localhost)
  --host [address]           Bind to address (default: 0.0.0.0 if flag present without value)
  -p, --port <number>        Port to listen on (default: 5173)
  -a, --agent-host <ws-url>  Pre-configure agent host WebSocket URL
  --no-open                  Do not automatically open the browser
  --help                     Show help
`);
		process.exit(0);
	}
}

if (!existsSync(distDir)) {
	console.error("Error: dist/ directory not found. Please build the application first with 'npm run build'.");
	process.exit(1);
}

const server = http.createServer((req, res) => {
	const urlPath = req.url ? req.url.split("?")[0] : "/";
	let safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
	if (safePath === "/" || safePath === "") {
		safePath = "/index.html";
	}

	let filePath = path.join(distDir, safePath);
	if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
		// Single Page Application (SPA) fallback to index.html
		filePath = path.join(distDir, "index.html");
	}

	const ext = path.extname(filePath).toLowerCase();
	const contentType = MIME_TYPES[ext] || "application/octet-stream";

	try {
		const content = readFileSync(filePath);
		res.writeHead(200, {
			"Content-Type": contentType,
			"Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
		});
		res.end(content);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		res.writeHead(500, { "Content-Type": "text/plain" });
		res.end(`Internal Server Error: ${message}`);
	}
});

function openBrowser(url) {
	const platform = process.platform;
	let cmd = "";
	if (platform === "darwin") {
		cmd = `open "${url}"`;
	} else if (platform === "win32") {
		cmd = `start "" "${url}"`;
	} else {
		cmd = `xdg-open "${url}"`;
	}
	exec(cmd, () => {});
}

server.on("error", (err) => {
	if (err && typeof err === "object" && "code" in err && err.code === "EADDRINUSE") {
		console.log(`Port ${port} in use, trying ${port + 1}...`);
		port++;
		server.listen(port, listenHost);
	} else {
		console.error("Server error:", err);
		process.exit(1);
	}
});

server.listen(port, listenHost, () => {
	const isWildcard = listenHost === "0.0.0.0" || listenHost === "::";
	const querySuffix = agentHostParam ? `?host=${encodeURIComponent(agentHostParam)}` : "";
	const localUrl = `http://localhost:${port}${querySuffix}`;
	const networkIps = isWildcard ? getNetworkIps() : [];

	console.log(`
┌────────────────────────────────────────────────────────┐
│                                                        │
│   Agent Host Protocol UI                               │
│                                                        │
│   > Local:   ${localUrl.padEnd(42)}│`);

	for (const ip of networkIps) {
		const netUrl = `http://${ip}:${port}${querySuffix}`;
		console.log(`│   > Network: ${netUrl.padEnd(42)}│`);
	}

	console.log(`│                                                        │
│   Press Ctrl+C to stop                                 │
└────────────────────────────────────────────────────────┘
`);
	if (autoOpen) {
		openBrowser(localUrl);
	}
});

process.on("SIGINT", () => {
	server.close(() => process.exit(0));
});

process.on("SIGTERM", () => {
	server.close(() => process.exit(0));
});
