import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(__dirname, "../bin/cli.js");

function fetchUrl(url) {
	return new Promise((resolve, reject) => {
		http.get(url, (res) => {
			let data = "";
			res.on("data", (chunk) => {
				data += chunk;
			});
			res.on("end", () => {
				resolve({ statusCode: res.statusCode, headers: res.headers, body: data });
			});
		}).on("error", reject);
	});
}

function startCli(args = [], env = {}) {
	return new Promise((resolve, reject) => {
		const proc = spawn(process.execPath, [cliPath, ...args], {
			env: { ...process.env, ...env },
			stdio: ["pipe", "pipe", "pipe"],
		});

		let output = "";
		let resolved = false;

		proc.stdout.on("data", (chunk) => {
			output += chunk.toString();
			if (output.includes("Press Ctrl+C to stop") && !resolved) {
				resolved = true;
				resolve({ proc, getOutput: () => output });
			}
		});

		proc.stderr.on("data", (chunk) => {
			output += chunk.toString();
		});

		proc.on("error", (err) => {
			if (!resolved) {
				resolved = true;
				reject(err);
			}
		});

		proc.on("exit", (code) => {
			if (!resolved) {
				resolved = true;
				reject(new Error(`CLI exited prematurely with code ${code}: ${output}`));
			}
		});
	});
}

describe("CLI External Serving & Hostname Binding", () => {
	it("binds to 0.0.0.0 with --bind flag and serves requests", async () => {
		const port = 5210;
		const { proc, getOutput } = await startCli([
			"--bind",
			"0.0.0.0",
			"--port",
			String(port),
			"--no-open",
		]);

		try {
			assert.ok(getOutput().includes("Local:"), "Should display local URL");
			const res = await fetchUrl(`http://127.0.0.1:${port}`);
			assert.equal(res.statusCode, 200);
			assert.ok(res.body.includes("<html") || res.body.includes("<!DOCTYPE html>"));
		} finally {
			proc.kill("SIGTERM");
		}
	});

	it("binds to 0.0.0.0 with --host flag without argument", async () => {
		const port = 5211;
		const { proc, getOutput } = await startCli([
			"--host",
			"--port",
			String(port),
			"--no-open",
		]);

		try {
			assert.ok(getOutput().includes("Local:"));
			const res = await fetchUrl(`http://127.0.0.1:${port}`);
			assert.equal(res.statusCode, 200);
		} finally {
			proc.kill("SIGTERM");
		}
	});

	it("binds to 0.0.0.0 using HOST environment variable", async () => {
		const port = 5212;
		const { proc, getOutput } = await startCli(
			["--no-open"],
			{ HOST: "0.0.0.0", PORT: String(port) },
		);

		try {
			assert.ok(getOutput().includes("Local:"));
			const res = await fetchUrl(`http://127.0.0.1:${port}`);
			assert.equal(res.statusCode, 200);
		} finally {
			proc.kill("SIGTERM");
		}
	});

	it("binds using --host=0.0.0.0 syntax", async () => {
		const port = 5213;
		const { proc, getOutput } = await startCli([
			"--host=0.0.0.0",
			`--port=${port}`,
			"--no-open",
		]);

		try {
			assert.ok(getOutput().includes("Local:"));
			const res = await fetchUrl(`http://127.0.0.1:${port}`);
			assert.equal(res.statusCode, 200);
		} finally {
			proc.kill("SIGTERM");
		}
	});

	it("binds to 127.0.0.1 with --hostname flag", async () => {
		const port = 5214;
		const { proc, getOutput } = await startCli([
			"--hostname",
			"127.0.0.1",
			"--port",
			String(port),
			"--no-open",
		]);

		try {
			assert.ok(getOutput().includes("Local:"));
			const res = await fetchUrl(`http://127.0.0.1:${port}`);
			assert.equal(res.statusCode, 200);
		} finally {
			proc.kill("SIGTERM");
		}
	});

	it("rewrites loopback in --agent-host for network URLs when bound to 0.0.0.0", async () => {
		const port = 5215;
		const { proc, getOutput } = await startCli([
			"--bind",
			"0.0.0.0",
			"--port",
			String(port),
			"--agent-host",
			"ws://127.0.0.1:63877?tkn=secret",
			"--no-open",
		]);

		try {
			const output = getOutput();
			assert.ok(output.includes(`Local:   http://localhost:${port}?host=ws%3A%2F%2F127.0.0.1%3A63877%3Ftkn%3Dsecret`));
			// If there are network interfaces, verify the network line does NOT contain 127.0.0.1
			if (output.includes("Network:")) {
				const networkLines = output.split("\n").filter((l) => l.includes("Network:"));
				for (const line of networkLines) {
					assert.ok(!line.includes("127.0.0.1"), `Network URL should rewrite loopback to interface IP: ${line}`);
					assert.ok(line.includes("%3A63877"), `Network URL should preserve port and token: ${line}`);
				}
			}
		} finally {
			proc.kill("SIGTERM");
		}
	});
});
