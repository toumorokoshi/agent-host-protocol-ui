/**
 * Agent Host Protocol Connection Manager
 * Integrates directly with @microsoft/agent-host-protocol client and WebSocket transport.
 */

import type { AgentInfo, ChatState, RootState, SessionSummary, Turn } from "@microsoft/agent-host-protocol";
import { AhpClient, AhpStateMirror, type Subscription } from "@microsoft/agent-host-protocol/client";
import { WebSocketTransport } from "@microsoft/agent-host-protocol/ws";
import type { ConnectionStatus, HostConfig, ModelInfo, SkillItem, UiSession, UiToolCall, UiTurn } from "../types.ts";

export function pathFromFileUri(uri: string): string {
	if (uri.startsWith("file://")) {
		return decodeURIComponent(uri.replace(/^file:\/\//, ""));
	}
	return uri;
}

export function fileUriFromPath(path: string): string {
	if (path.startsWith("file://")) return path;
	const normalized = path.startsWith("/") ? path : `/${path}`;
	return `file://${encodeURI(normalized)}`;
}

export class AhpConnection {
	private client: AhpClient | null = null;
	private transport: WebSocketTransport | null = null;
	private mirror: AhpStateMirror = new AhpStateMirror();
	private status: ConnectionStatus = "disconnected";
	private statusListeners: Array<(status: ConnectionStatus) => void> = [];

	// Remote metadata retrieved from the host
	private defaultDirectory: string = "/";
	private remoteAgents: AgentInfo[] = [];
	private remoteModels: ModelInfo[] = [];
	private activeSubscriptions = new Map<string, Subscription>();

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

	getRemoteInfo(): { defaultDirectory: string; agents: AgentInfo[]; models: ModelInfo[] } {
		return {
			defaultDirectory: this.defaultDirectory,
			agents: this.remoteAgents,
			models: this.remoteModels,
		};
	}

	/**
	 * Connect to an Agent Host via WebSocket.
	 */
	async connect(host: HostConfig): Promise<{ success: boolean; error?: string }> {
		this.disconnect();
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
			const initResult = (await this.client.initialize({
				clientId: `ahp-ui-${crypto.randomUUID().slice(0, 8)}`,
				protocolVersions: ["1.0.0", "0.9.0"],
				initialSubscriptions: ["ahp-root://"],
			})) as unknown as {
				defaultDirectory?: string;
				snapshots: Array<{ channel: string; state: unknown }>;
			};

			if (initResult.defaultDirectory) {
				this.defaultDirectory = pathFromFileUri(initResult.defaultDirectory);
			}

			for (const snapshot of initResult.snapshots || []) {
				this.mirror.applySnapshot(snapshot as any);
			}

			// Populate remote agents & models from root snapshot
			this.refreshRemoteState(this.mirror.root);

			// Listen for root channel updates
			const rootSub = this.client.attachSubscription("ahp-root://");
			this.activeSubscriptions.set("ahp-root://", rootSub);

			(async () => {
				try {
					for await (const event of rootSub) {
						if (event.type === "action") {
							this.mirror.apply(event.params as any);
							this.refreshRemoteState(this.mirror.root);
						}
					}
				} catch {
					// stream closed
				}
			})();

			this.setStatus("connected");
			return { success: true };
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			console.warn("Failed to connect to AHP host:", err);
			this.setStatus("error");
			return { success: false, error: msg };
		}
	}

	private refreshRemoteState(root: RootState) {
		if (root?.agents && root.agents.length > 0) {
			this.remoteAgents = root.agents;
			const models: ModelInfo[] = [];

			for (const agent of root.agents) {
				for (const m of agent.models || []) {
					models.push({
						id: m.id,
						displayName: m.name || m.id,
						provider: m.provider || agent.provider,
						supportsThinking: true,
					});
				}
			}

			if (models.length > 0) {
				this.remoteModels = models;
			}
		}
	}

	/**
	 * Fetch all sessions from the remote host using listSessions RPC.
	 */
	async listSessions(): Promise<UiSession[]> {
		if (!this.client || this.status !== "connected") {
			return [];
		}

		try {
			const res = (await this.client.request("listSessions", {
				channel: "ahp-root://",
				limit: 100,
			} as any)) as { items: SessionSummary[] };

			const defaultModel = this.remoteModels[0]?.id || "pi";

			return (res.items || []).map((summary) => {
				const cwdUri = summary.workingDirectories?.[0] || "";
				const cwd = cwdUri ? pathFromFileUri(cwdUri) : this.defaultDirectory;
				const id = (summary as any).id || summary.resource.replace(/^ahp-session:\/?/, "");

				return {
					id,
					title: summary.title || `Session ${id.slice(0, 8)}`,
					workingDirectory: cwd,
					modifiedAt: summary.modifiedAt || new Date().toISOString(),
					isLive: (summary as any).isLive ?? Boolean(Number(summary.status) & 8 || summary.activity),
					isArchived: Boolean(Number(summary.status) & 64),
					model: defaultModel,
					thinkingLevel: "high",
					turns: [],
					queuedMessages: [],
					skills: this.getSkillsForSession(),
				};
			});
		} catch (err) {
			console.warn("listSessions RPC failed:", err);
			return [];
		}
	}

	/**
	 * Extract skills and prompt templates advertised by the host.
	 */
	getSkillsForSession(): SkillItem[] {
		const items: SkillItem[] = [
			{ id: "ahp", name: "/ahp", description: "Control and inspect Agent Host Protocol status", type: "command" },
			{
				id: "commit",
				name: "/commit",
				description: "Inspect diff and author conventional commit message",
				type: "skill",
			},
		];

		for (const agent of this.remoteAgents) {
			for (const custom of agent.customizations || []) {
				const desc = (custom as any).description || `${custom.type} customization`;
				items.push({
					id: (custom as any).name || custom.type,
					name: `/${(custom as any).name || custom.type}`,
					description: desc,
					type: "skill",
				});
			}
		}

		return items;
	}

	/**
	 * Create a new session on the remote host.
	 */
	async createSession(args: { title: string; workingDirectory: string; model?: string }): Promise<string> {
		if (!this.client || this.status !== "connected") {
			throw new Error("Not connected to a live Agent Host");
		}

		const sessionId = crypto.randomUUID();
		const sessionUri = `ahp-session:/${sessionId}`;
		const fileUri = fileUriFromPath(args.workingDirectory);

		await this.client.request("createSession", {
			channel: sessionUri,
			workingDirectories: [fileUri],
			provider: this.remoteAgents[0]?.provider || "pi",
		} as any);

		return sessionId;
	}

	/**
	 * Subscribe to a session and its chat stream.
	 */
	async subscribeSession(
		sessionId: string,
		onUpdate: (data: { turns?: UiTurn[]; activeTurn?: UiTurn; queuedMessages?: string[]; title?: string }) => void,
	): Promise<() => void> {
		if (!this.client || this.status !== "connected") {
			return () => {};
		}

		const sessionUri = `ahp-session:/${sessionId}`;
		const chatUri = `ahp-chat:/${sessionId}`;

		try {
			// Subscribe to session
			const { result: sessionRes, subscription: sessionSub } = await this.client.subscribe(sessionUri);
			this.mirror.applySnapshot(sessionRes as any);

			// Subscribe to chat
			const { result: chatRes, subscription: chatSub } = await this.client.subscribe(chatUri);
			this.mirror.applySnapshot(chatRes as any);

			const initialChatState = chatRes as unknown as ChatState;

			// Map initial turns and activeTurn
			const initialTurns = (initialChatState.turns || []).map(mapChatTurnToUiTurn);
			let currentActiveTurn: UiTurn | undefined = initialChatState.activeTurn
				? mapChatTurnToUiTurn({ ...(initialChatState.activeTurn as any), state: "streaming" })
				: undefined;

			onUpdate({
				turns: initialTurns,
				activeTurn: currentActiveTurn,
				queuedMessages: (initialChatState.queuedMessages || []).map((m) => m.message.text),
			});

			// Stream listener
			let active = true;
			(async () => {
				try {
					for await (const event of chatSub) {
						if (!active) break;
						if (event.type === "action") {
							const action = (event.params as any)?.action;
							if (!action) continue;

							const actionType = String(action.type);

							if (actionType === "chat/turnStarted") {
								currentActiveTurn = {
									id: action.turnId || `turn-${Date.now()}`,
									userPrompt: action.message?.text || "",
									startedAt: new Date().toISOString(),
									assistantText: "",
									toolCalls: [],
									state: "streaming",
								};
								onUpdate({ activeTurn: currentActiveTurn });
							} else if (actionType === "chat/textDelta") {
								if (currentActiveTurn) {
									currentActiveTurn = {
										...currentActiveTurn,
										assistantText: currentActiveTurn.assistantText + (action.delta || ""),
									};
									onUpdate({ activeTurn: currentActiveTurn });
								}
							} else if (actionType === "chat/reasoning") {
								if (currentActiveTurn) {
									currentActiveTurn = {
										...currentActiveTurn,
										thinkingContent: (currentActiveTurn.thinkingContent || "") + (action.delta || ""),
									};
									onUpdate({ activeTurn: currentActiveTurn });
								}
							} else if (actionType === "chat/toolCallStart") {
								if (currentActiveTurn) {
									const tool: UiToolCall = {
										id: action.toolCallId || `tc-${Date.now()}`,
										name: action.toolName || "tool",
										arguments: action.input || {},
										status: "running",
									};
									currentActiveTurn = {
										...currentActiveTurn,
										toolCalls: [...currentActiveTurn.toolCalls, tool],
									};
									onUpdate({ activeTurn: currentActiveTurn });
								}
							} else if (actionType === "chat/toolCallDelta") {
								if (currentActiveTurn) {
									currentActiveTurn = {
										...currentActiveTurn,
										toolCalls: currentActiveTurn.toolCalls.map((tc) =>
											tc.id === action.toolCallId
												? {
														...tc,
														status: "completed",
														result: typeof action.result === "string" ? action.result : JSON.stringify(action.result),
													}
												: tc,
										),
									};
									onUpdate({ activeTurn: currentActiveTurn });
								}
							} else if (actionType === "chat/turnComplete") {
								currentActiveTurn = undefined;
								onUpdate({ activeTurn: undefined });
								// Re-fetch turns to ensure state accuracy
								this.client?.request("fetchTurns" as any, { channel: chatUri }).catch(() => {});
							}
						}
					}
				} catch {
					// Closed
				}
			})();

			return () => {
				active = false;
				sessionSub.close();
				chatSub.close();
			};
		} catch (err) {
			console.warn("subscribeSession failed:", err);
			return () => {};
		}
	}

	/**
	 * Send a user message to trigger a turn.
	 */
	async sendMessage(sessionId: string, text: string, model: string): Promise<void> {
		if (!this.client) return;
		const chatUri = `ahp-chat:/${sessionId}`;

		this.client.dispatch(chatUri, {
			type: "chat/turnStarted",
			turnId: `turn-${Date.now()}`,
			message: {
				text,
				origin: { kind: "user" },
				model: { id: model },
			},
		} as any);
	}

	/**
	 * Cancel an in-flight turn.
	 */
	async cancelTurn(sessionId: string): Promise<void> {
		if (!this.client) return;
		const chatUri = `ahp-chat:/${sessionId}`;
		this.client.dispatch(chatUri, {
			type: "chat/turnCancelled",
		} as any);
	}

	/**
	 * Steer an in-flight turn.
	 */
	async steerTurn(sessionId: string, text: string): Promise<void> {
		if (!this.client) return;
		const chatUri = `ahp-chat:/${sessionId}`;
		this.client.dispatch(chatUri, {
			type: "chat/pendingMessageSet",
			kind: "steering",
			message: { text, origin: { kind: "user" } },
		} as any);
	}

	/**
	 * Queue a follow-up message.
	 */
	async queueMessage(sessionId: string, text: string): Promise<void> {
		if (!this.client) return;
		const chatUri = `ahp-chat:/${sessionId}`;
		this.client.dispatch(chatUri, {
			type: "chat/pendingMessageSet",
			kind: "queued",
			message: { text, origin: { kind: "user" } },
		} as any);
	}

	/**
	 * Confirm or reject a tool call.
	 */
	async confirmToolCall(sessionId: string, toolCallId: string, approved: boolean): Promise<void> {
		if (!this.client) return;
		const chatUri = `ahp-chat:/${sessionId}`;
		this.client.dispatch(chatUri, {
			type: "chat/toolCallConfirmed",
			toolCallId,
			confirmed: approved,
		} as any);
	}

	/**
	 * Dispose an empty session.
	 */
	async disposeSession(sessionId: string): Promise<void> {
		if (!this.client) return;
		await this.client.request("disposeSession" as any, {
			channel: `ahp-session:/${sessionId}`,
		});
	}

	/**
	 * Query slash-command completions for skills and templates.
	 */
	async getCompletions(sessionId: string, text: string): Promise<SkillItem[]> {
		if (!this.client) return [];
		try {
			const res = (await this.client.request("completions" as any, {
				channel: `ahp-chat:/${sessionId}`,
				text,
				offset: text.length,
				kind: "userMessage",
			})) as unknown as { items: Array<{ insertText: string; label?: string; detail?: string }> };

			return (res.items || []).map((item) => ({
				id: item.label || item.insertText,
				name: item.label || item.insertText,
				description: item.detail || "Remote skill or template",
				type: "skill",
			}));
		} catch {
			return [];
		}
	}

	disconnect() {
		for (const sub of this.activeSubscriptions.values()) {
			sub.close();
		}
		this.activeSubscriptions.clear();

		if (this.transport) {
			try {
				this.transport.close();
			} catch {
				// ignore close error
			}
		}
		this.client = null;
		this.transport = null;
		this.setStatus("disconnected");
	}
}

function mapChatTurnToUiTurn(turn: Turn): UiTurn {
	let assistantText = "";
	let thinkingContent = "";
	const toolCalls: UiToolCall[] = [];
	let resumableError: string | undefined;

	for (const part of turn.responseParts || []) {
		if (part.kind === "markdown") {
			assistantText += (part as any).content || "";
		} else if (part.kind === "reasoning") {
			thinkingContent += (part as any).content || "";
		} else if (part.kind === "toolCall") {
			const tc = (part as any).toolCall;
			if (tc) {
				toolCalls.push({
					id: tc.toolCallId || `tc-${Math.random()}`,
					name: tc.toolName || "tool",
					arguments: tc.input || tc.arguments || {},
					status: tc.status || "completed",
					result: tc.result ? (typeof tc.result === "string" ? tc.result : JSON.stringify(tc.result)) : undefined,
					error: tc.error ? String(tc.error) : undefined,
				});
			}
		} else if (part.kind === "error") {
			if ((part as any).resumable) {
				resumableError = (part as any).error?.message || "Error occurred";
			}
		}
	}

	return {
		id: turn.id,
		userPrompt: turn.message?.text || "",
		startedAt: turn.startedAt || new Date().toISOString(),
		durationMs: turn.duration,
		model: turn.message?.model?.id,
		assistantText,
		thinkingContent: thinkingContent || undefined,
		thinkingDurationMs: thinkingContent ? 1200 : undefined,
		toolCalls,
		resumableError,
		tokens: turn.usage
			? { prompt: (turn.usage as any).promptTokens || 0, completion: (turn.usage as any).completionTokens || 0 }
			: undefined,
		state: (turn.state as any) || "complete",
	};
}

export const ahpConnection = new AhpConnection();
