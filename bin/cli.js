#!/usr/bin/env node

import { exec } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import http from "node:http";
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

// Parse command line arguments
const args = process.argv.slice(2);
let port = 5173;
let autoOpen = true;
let hostParam = "";

for (let i = 0; i < args.length; i++) {
	const arg = args[i];
	if (arg === "--port" || arg === "-p") {
		port = Number.parseInt(args[++i], 10) || 5173;
	} else if (arg === "--no-open") {
		autoOpen = false;
	} else if (arg === "--host" || arg === "-h") {
		hostParam = args[++i] || "";
	} else if (arg === "--help") {
		console.log(`
agent-host-protocol-ui - Client-side UI for Agent Host Protocol

Usage:
  npx agent-host-protocol-ui [options]

Options:
  -p, --port <number>     Port to listen on (default: 5173)
  -h, --host <ws-url>     Pre-configure host WebSocket URL
  --no-open               Do not automatically open the browser
  --help                  Show help
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
		server.listen(port);
	} else {
		console.error("Server error:", err);
		process.exit(1);
	}
});

server.listen(port, () => {
	let targetUrl = `http://localhost:${port}`;
	if (hostParam) {
		targetUrl += `?host=${encodeURIComponent(hostParam)}`;
	}
	console.log(`
┌────────────────────────────────────────────────────────┐
│                                                        │
│   Agent Host Protocol UI                               │
│   Running at: ${targetUrl.padEnd(41)}│
│                                                        │
│   Press Ctrl+C to stop                                 │
└────────────────────────────────────────────────────────┘
`);
	if (autoOpen) {
		openBrowser(targetUrl);
	}
});

process.on("SIGINT", () => {
	server.close(() => process.exit(0));
});

process.on("SIGTERM", () => {
	server.close(() => process.exit(0));
});
