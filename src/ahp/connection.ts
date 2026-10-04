/**
 * Agent Host Protocol Connection Manager
 * Integrates directly with @microsoft/agent-host-protocol/client and ws
 */

import { AhpClient, AhpStateMirror } from "@microsoft/agent-host-protocol/client";
import { WebSocketTransport } from "@microsoft/agent-host-protocol/ws";
import type { ConnectionStatus, HostConfig } from "../types.ts";

export class AhpConnection {
	private client: AhpClient | null = null;
	private transport: WebSocketTransport | null = null;
	private mirror: AhpStateMirror = new AhpStateMirror();
	private status: ConnectionStatus = "disconnected";
	private statusListeners: Array<(status: ConnectionStatus) => void> = [];

	getStatus(): ConnectionStatus {
		return this.status;
	}

	onStatusChange(listener: (status: ConnectionStatus) => void): () => void {
		this.statusListeners.push(listener);
		return () => {
			this.statusListeners = this.statusListeners.filter((l) => l !== listener);
		};
	}

	private setStatus(status: ConnectionStatus) {
		this.status = status;
		for (const listener of this.statusListeners) {
			listener(status);
		}
	}

	/**
	 * Connect to an Agent Host via WebSocket.
	 */
	async connect(host: HostConfig): Promise<boolean> {
		this.setStatus("connecting");

		try {
			let fullUrl = host.url;
			if (host.token && !fullUrl.includes("tkn=")) {
				const separator = fullUrl.includes("?") ? "&" : "?";
				fullUrl = `${fullUrl}${separator}tkn=${encodeURIComponent(host.token)}`;
			}

			this.transport = await WebSocketTransport.connect(fullUrl);
			this.client = new AhpClient(this.transport);
			this.client.connect();

			// Handshake
			const initResult = await this.client.initialize({
				clientId: `ahp-ui-client-${Math.random().toString(36).slice(2, 8)}`,
				protocolVersions: ["1.0.0", "0.9.0"],
				initialSubscriptions: ["ahp-root://"],
			});

			for (const snapshot of initResult.snapshots) {
				this.mirror.applySnapshot(snapshot);
			}

			this.setStatus("connected");
			return true;
		} catch (err) {
			console.warn("Failed to connect to AHP host:", err);
			this.setStatus("error");
			return false;
		}
	}

	disconnect() {
		if (this.transport) {
			try {
				this.transport.close();
			} catch {
				// ignore close errors
			}
		}
		this.client = null;
		this.transport = null;
		this.setStatus("disconnected");
	}

	getClient(): AhpClient | null {
		return this.client;
	}

	getMirror(): AhpStateMirror {
		return this.mirror;
	}
}

export const ahpConnection = new AhpConnection();
