import type { ConnectionStatus, HostConfig, ModelInfo, UiSession } from "../types.ts";
import { AhpConnection } from "./connection.ts";

/**
 * Manager for multiple concurrent or selectable Agent Host Protocol (AHP) connections.
 * Allows querying metadata (directories, models) and executing sessions across multiple AHP instances.
 */
export class MultiAhpManager {
	private connections = new Map<string, AhpConnection>();
	private hostStatuses = new Map<string, ConnectionStatus>();
	private statusListeners = new Map<string, Array<(status: ConnectionStatus) => void>>();

	/**
	 * Returns an existing AhpConnection for the given hostId if present.
	 */
	getConnection(hostId: string): AhpConnection | undefined {
		return this.connections.get(hostId);
	}

	/**
	 * Retrieves an existing connection for the host or instantiates a new one.
	 */
	getOrCreateConnection(host: HostConfig): AhpConnection {
		let conn = this.connections.get(host.id);
		if (!conn) {
			conn = new AhpConnection();
			this.connections.set(host.id, conn);
			conn.onStatusChange((status) => {
				this.hostStatuses.set(host.id, status);
				const listeners = this.statusListeners.get(host.id) || [];
				for (const listener of listeners) {
					listener(status);
				}
			});
		}
		return conn;
	}

	/**
	 * Connects to a specific AHP host.
	 */
	async connectHost(host: HostConfig): Promise<{ success: boolean; error?: string }> {
		const conn = this.getOrCreateConnection(host);
		const result = await conn.connect(host);
		if (result.success) {
			const info = conn.getRemoteInfo();
			host.defaultDirectory = info.defaultDirectory;
			host.models = info.models;
		}
		return result;
	}

	/**
	 * Subscribes to status changes for a specific host.
	 */
	onHostStatusChange(hostId: string, listener: (status: ConnectionStatus) => void): () => void {
		const list = this.statusListeners.get(hostId) || [];
		list.push(listener);
		this.statusListeners.set(hostId, list);
		return () => {
			const current = this.statusListeners.get(hostId) || [];
			this.statusListeners.set(
				hostId,
				current.filter((l) => l !== listener),
			);
		};
	}

	/**
	 * Gets connection status for a host.
	 */
	getHostStatus(hostId: string): ConnectionStatus {
		return this.hostStatuses.get(hostId) || this.connections.get(hostId)?.getStatus() || "disconnected";
	}

	/**
	 * Fetches metadata (default directory and models) from an AHP host, connecting temporarily if necessary.
	 */
	async fetchHostInfo(host: HostConfig): Promise<{ defaultDirectory: string; models: ModelInfo[] }> {
		const conn = this.getOrCreateConnection(host);
		if (conn.getStatus() !== "connected") {
			const res = await conn.connect(host);
			if (!res.success) {
				return {
					defaultDirectory: host.defaultDirectory || "/",
					models: host.models || [{ id: "pi", displayName: "Default (Pi)", provider: "pi", supportsThinking: true }],
				};
			}
		}
		const info = conn.getRemoteInfo();
		host.defaultDirectory = info.defaultDirectory;
		host.models = info.models;
		return {
			defaultDirectory: info.defaultDirectory,
			models: info.models,
		};
	}

	/**
	 * Fetches all sessions from a given host, tagging each session with hostId and hostName.
	 */
	async listSessionsForHost(host: HostConfig): Promise<UiSession[]> {
		const conn = this.getOrCreateConnection(host);
		if (conn.getStatus() !== "connected") {
			const res = await conn.connect(host);
			if (!res.success) return [];
		}
		const sessions = await conn.listSessions();
		return sessions.map((s) => ({
			...s,
			hostId: host.id,
			hostName: host.name,
		}));
	}

	/**
	 * Disconnects and cleans up a specific host connection.
	 */
	disconnectHost(hostId: string): void {
		const conn = this.connections.get(hostId);
		if (conn) {
			conn.disconnect();
			this.connections.delete(hostId);
			this.hostStatuses.delete(hostId);
		}
	}

	/**
	 * Disconnects all active host connections.
	 */
	disconnectAll(): void {
		for (const conn of this.connections.values()) {
			conn.disconnect();
		}
		this.connections.clear();
		this.hostStatuses.clear();
	}
}

export const multiAhp = new MultiAhpManager();
