/**
 * Agent Host Protocol Connection Manager
 * Integrates directly with @microsoft/agent-host-protocol client and WebSocket transport.
 */

import type { AgentInfo, ChatState, RootState, SessionSummary, Turn } from "@microsoft/agent-host-protocol";
import { AhpClient, AhpStateMirror, type Subscription } from "@microsoft/agent-host-protocol/client";
import { WebSocketTransport } from "@microsoft/agent-host-protocol/ws";
import { randomUUID } from "../crypto/uuid.ts";
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

/**
 * Strips provider prefixes and schemes from session resources or identifiers.
 * e.g., "pi:/01a10912-fbd3-7307-9258-4148e09944ea" -> "01a10912-fbd3-7307-9258-4148e09944ea"
 * e.g., "ahp-session:/01a10912-fbd3-7307-9258-4148e09944ea" -> "01a10912-fbd3-7307-9258-4148e09944ea"
 * e.g., "ahp-session://default/01a10912-fbd3-7307-9258-4148e09944ea" -> "01a10912-fbd3-7307-9258-4148e09944ea"
 */
export function extractSessionId(resource: string): string {
	if (!resource) return "";
	const cleaned = resource.replace(/^(?:ahp-session|pi|[a-z0-9_-]+):(?:\/{1,2}[^/]+\/|\/{1,2})?/i, "");
	return cleaned || resource;
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
	private sessionChatUris = new Map<string, string>();

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
			const initResult = await this.client.initialize({
				clientId: `ahp-ui-${randomUUID().slice(0, 8)}`,
				protocolVersions: ["1.0.0", "0.9.0"],
				initialSubscriptions: ["ahp-root://"],
			});

			if (initResult.defaultDirectory) {
				this.defaultDirectory = pathFromFileUri(initResult.defaultDirectory);
			}

			for (const snapshot of initResult.snapshots || []) {
				this.mirror.applySnapshot(snapshot);
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
				const id = (summary as any).id || extractSessionId(summary.resource);

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

		const sessionId = randomUUID();
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

		const cleanId = extractSessionId(sessionId);
		const sessionUri = `ahp-session:/${cleanId}`;
		const canonicalChatUri = `ahp-chat:/${cleanId}`;

		try {
			// Subscribe to session
			const { result: sessionRes, subscription: sessionSub } = await this.client.subscribe(sessionUri);
			const sessionSnapshot = sessionRes.snapshot;
			if (sessionSnapshot?.resource) {
				this.mirror.applySnapshot(sessionSnapshot);
			}

			// Determine target chat URI (server might advertise defaultChat or canonical)
			const sessionState = sessionSnapshot?.state as { defaultChat?: string } | undefined;
			const chatUri = sessionState?.defaultChat || canonicalChatUri;
			this.sessionChatUris.set(cleanId, chatUri);

			// Subscribe to chat
			const { result: chatRes, subscription: chatSub } = await this.client.subscribe(chatUri);
			const chatSnapshot = chatRes.snapshot;
			if (chatSnapshot?.resource) {
				this.mirror.applySnapshot(chatSnapshot);
			}

			const initialChatState = chatSnapshot?.state as ChatState | undefined;

			// Map initial turns and activeTurn
			const initialTurns = (initialChatState?.turns || []).map(mapChatTurnToUiTurn);
			let currentActiveTurn: UiTurn | undefined = initialChatState?.activeTurn
				? mapChatTurnToUiTurn({ ...(initialChatState.activeTurn as any), state: "streaming" })
				: undefined;

			onUpdate({
				turns: [...initialTurns],
				activeTurn: currentActiveTurn,
				queuedMessages: (initialChatState?.queuedMessages || []).map((m: any) => m.message?.text || m.text || ""),
			});

			let active = true;

			// Listen to session metadata changes (e.g. title)
			(async () => {
				try {
					for await (const event of sessionSub) {
						if (!active) break;
						if (event.type === "action") {
							const action = (event.params as any)?.action;
							if (action?.type === "session/titleChanged" && action.title) {
								onUpdate({ title: action.title });
							}
						}
					}
				} catch {
					// stream closed
				}
			})();

			// Listen to chat stream actions
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
									startedAt: action.startedAt || new Date().toISOString(),
									model: action.message?.model?.id,
									assistantText: "",
									toolCalls: [],
									state: "streaming",
								};
								onUpdate({ activeTurn: currentActiveTurn });
							} else if (actionType === "chat/responsePart") {
								if (currentActiveTurn && action.part) {
									if (action.part.kind === "markdown") {
										currentActiveTurn = {
											...currentActiveTurn,
											assistantText: currentActiveTurn.assistantText + (action.part.content || ""),
										};
									} else if (action.part.kind === "reasoning") {
										currentActiveTurn = {
											...currentActiveTurn,
											thinkingContent: (currentActiveTurn.thinkingContent || "") + (action.part.content || ""),
										};
									}
									onUpdate({ activeTurn: currentActiveTurn });
								}
							} else if (actionType === "chat/delta" || actionType === "chat/textDelta") {
								if (currentActiveTurn) {
									const delta = action.content || action.delta || "";
									currentActiveTurn = {
										...currentActiveTurn,
										assistantText: currentActiveTurn.assistantText + delta,
									};
									onUpdate({ activeTurn: currentActiveTurn });
								}
							} else if (actionType === "chat/reasoning") {
								if (currentActiveTurn) {
									const delta = action.content || action.delta || "";
									currentActiveTurn = {
										...currentActiveTurn,
										thinkingContent: (currentActiveTurn.thinkingContent || "") + delta,
									};
									onUpdate({ activeTurn: currentActiveTurn });
								}
							} else if (actionType === "chat/toolCallStart" || actionType === "chat/toolCallReady") {
								if (currentActiveTurn) {
									const existingIdx = currentActiveTurn.toolCalls.findIndex((tc) => tc.id === action.toolCallId);
									const tool: UiToolCall = {
										id: action.toolCallId || `tc-${Date.now()}`,
										name: action.toolName || "tool",
										arguments: action.input || action.arguments || action.args || {},
										status: "running",
									};
									if (existingIdx >= 0) {
										currentActiveTurn.toolCalls[existingIdx] = {
											...currentActiveTurn.toolCalls[existingIdx],
											...tool,
										};
									} else {
										currentActiveTurn.toolCalls.push(tool);
									}
									onUpdate({ activeTurn: { ...currentActiveTurn, toolCalls: [...currentActiveTurn.toolCalls] } });
								}
							} else if (actionType === "chat/toolCallContentChanged" || actionType === "chat/toolCallDelta") {
								if (currentActiveTurn) {
									const chunk =
										typeof action.content === "string"
											? action.content
											: typeof action.result === "string"
												? action.result
												: "";
									currentActiveTurn = {
										...currentActiveTurn,
										toolCalls: currentActiveTurn.toolCalls.map((tc) =>
											tc.id === action.toolCallId
												? {
														...tc,
														result: (tc.result || "") + chunk,
													}
												: tc,
										),
									};
									onUpdate({ activeTurn: currentActiveTurn });
								}
							} else if (actionType === "chat/toolCallComplete") {
								if (currentActiveTurn) {
									const res = action.result;
									currentActiveTurn = {
										...currentActiveTurn,
										toolCalls: currentActiveTurn.toolCalls.map((tc) =>
											tc.id === action.toolCallId
												? {
														...tc,
														status: res?.success === false ? "cancelled" : "completed",
														result:
															typeof res?.content === "string"
																? res.content
																: typeof res === "string"
																	? res
																	: JSON.stringify(res?.content || res || ""),
														error: res?.error?.message,
													}
												: tc,
										),
									};
									onUpdate({ activeTurn: currentActiveTurn });
								}
							} else if (actionType === "chat/usage") {
								if (currentActiveTurn && action.usage) {
									currentActiveTurn = {
										...currentActiveTurn,
										tokens: {
											prompt: action.usage.inputTokens ?? action.usage.promptTokens ?? 0,
											completion: action.usage.outputTokens ?? action.usage.completionTokens ?? 0,
										},
									};
									onUpdate({ activeTurn: currentActiveTurn });
								}
							} else if (actionType === "chat/turnComplete") {
								if (currentActiveTurn) {
									const completedTurn: UiTurn = {
										...currentActiveTurn,
										state: "complete",
										durationMs: action.duration,
									};
									initialTurns.push(completedTurn);
									currentActiveTurn = undefined;
									onUpdate({ turns: [...initialTurns], activeTurn: undefined });
								}
							} else if (actionType === "chat/error") {
								if (currentActiveTurn) {
									const errTurn: UiTurn = {
										...currentActiveTurn,
										state: "error",
										resumableError:
											action.part?.error?.message || action.error?.message || "An error occurred during turn",
										durationMs: action.duration,
									};
									initialTurns.push(errTurn);
									currentActiveTurn = undefined;
									onUpdate({ turns: [...initialTurns], activeTurn: undefined });
								}
							} else if (actionType === "chat/turnCancelled") {
								if (currentActiveTurn) {
									const cancelledTurn: UiTurn = {
										...currentActiveTurn,
										state: "cancelled",
										durationMs: action.duration,
									};
									initialTurns.push(cancelledTurn);
									currentActiveTurn = undefined;
									onUpdate({ turns: [...initialTurns], activeTurn: undefined });
								}
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
		const cleanId = extractSessionId(sessionId);
		const chatUri = this.sessionChatUris.get(cleanId) || `ahp-chat:/${cleanId}`;

		const turnId = randomUUID();
		this.client.dispatch(chatUri, {
			type: "chat/turnStarted",
			turnId,
			startedAt: new Date().toISOString(),
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
	async cancelTurn(sessionId: string, turnId?: string): Promise<void> {
		if (!this.client) return;
		const cleanId = extractSessionId(sessionId);
		const chatUri = this.sessionChatUris.get(cleanId) || `ahp-chat:/${cleanId}`;
		this.client.dispatch(chatUri, {
			type: "chat/turnCancelled",
			turnId,
		} as any);
	}

	/**
	 * Steer an in-flight turn.
	 */
	async steerTurn(sessionId: string, text: string): Promise<void> {
		if (!this.client) return;
		const cleanId = extractSessionId(sessionId);
		const chatUri = this.sessionChatUris.get(cleanId) || `ahp-chat:/${cleanId}`;
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
		const cleanId = extractSessionId(sessionId);
		const chatUri = this.sessionChatUris.get(cleanId) || `ahp-chat:/${cleanId}`;
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
		const cleanId = extractSessionId(sessionId);
		const chatUri = this.sessionChatUris.get(cleanId) || `ahp-chat:/${cleanId}`;
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
		const cleanId = extractSessionId(sessionId);
		await this.client.request("disposeSession" as any, {
			channel: `ahp-session:/${cleanId}`,
		});
	}

	/**
	 * Query slash-command completions for skills and templates.
	 */
	async getCompletions(sessionId: string, text: string): Promise<SkillItem[]> {
		if (!this.client) return [];
		const cleanId = extractSessionId(sessionId);
		const chatUri = this.sessionChatUris.get(cleanId) || `ahp-chat:/${cleanId}`;
		try {
			const res = await this.client.completions({
				channel: chatUri,
				text,
				offset: text.length,
				kind: "userMessage" as any,
			});

			return (res.items || []).map((item) => ({
				id: item.attachment?.label || item.insertText,
				name: item.attachment?.label || item.insertText,
				description: (item.attachment as any)?.detail || "Remote skill or template",
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
			assistantText += part.content;
		} else if (part.kind === "reasoning") {
			thinkingContent += part.content;
		} else if (part.kind === "toolCall") {
			const tc = part.toolCall;
			const input = "input" in tc ? (tc.input as Record<string, unknown>) : {};
			const result = "result" in tc ? tc.result : undefined;
			const error = "error" in tc ? tc.error : undefined;
			toolCalls.push({
				id: tc.toolCallId || `tc-${Math.random()}`,
				name: tc.toolName || "tool",
				arguments: input || {},
				status: tc.status as any,
				result: result ? (typeof result === "string" ? result : JSON.stringify(result)) : undefined,
				error: error ? String(error) : undefined,
			});
		} else if (part.kind === "error") {
			if (part.resumable) {
				resumableError = part.error.message || "Error occurred";
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
		tokens: turn.usage ? { prompt: turn.usage.inputTokens ?? 0, completion: turn.usage.outputTokens ?? 0 } : undefined,
		state: turn.state,
	};
}

export const ahpConnection = new AhpConnection();
