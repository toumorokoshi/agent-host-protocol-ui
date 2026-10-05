import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ahpConnection } from "./ahp/connection.ts";
import { formatHostConnectionError, getDefaultHost } from "./ahp/host-utils.ts";
import { createInitialMockSessions, simulateTurnStream } from "./ahp/mock-host.ts";
import { ChatTimeline } from "./components/ChatTimeline.tsx";
import { Composer } from "./components/Composer.tsx";
import { Header } from "./components/Header.tsx";
import { HostModal } from "./components/HostModal.tsx";
import { Inspector } from "./components/Inspector.tsx";
import { NewSessionModal } from "./components/NewSessionModal.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { randomUUID } from "./crypto/uuid.ts";
import { type StoragePrivacyMode, vault } from "./crypto/vault.ts";
import { useTheme } from "./hooks/useTheme.ts";
import type { ConnectionStatus, HostConfig, ModelInfo, UiSession, UiTurn } from "./types.ts";

export const App: React.FC = () => {
	const { themePreference, resolvedTheme, setTheme } = useTheme();
	const [currentHost, setCurrentHost] = useState<HostConfig>(getDefaultHost);
	const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
	const [isMockMode, setIsMockMode] = useState<boolean>(true); // Starts in Demo Mode until host configured
	const [sessions, setSessions] = useState<UiSession[]>(createInitialMockSessions());
	const [activeSessionId, setActiveSessionId] = useState<string | null>(sessions[0]?.id || null);
	const [activeTurn, setActiveTurn] = useState<UiTurn | undefined>(undefined);
	const [isHostModalOpen, setIsHostModalOpen] = useState(false);
	const [isNewSessionModalOpen, setIsNewSessionModalOpen] = useState(false);
	const [isInspectorOpen, setIsInspectorOpen] = useState(
		() => typeof window !== "undefined" && window.innerWidth > 768,
	);
	const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

	// Remote metadata
	const [remoteDefaultDir, setRemoteDefaultDir] = useState<string>("");
	const [remoteModels, setRemoteModels] = useState<ModelInfo[]>([]);

	const cancelMockStreamRef = useRef<(() => void) | null>(null);
	const unsubscribeLiveSessionRef = useRef<(() => void) | null>(null);

	// Initialize vault on startup
	useEffect(() => {
		vault.init("ephemeral").catch((err) => console.warn("Vault init failed:", err));
	}, []);

	// Listen to connection status changes
	useEffect(() => {
		return ahpConnection.onStatusChange((status) => {
			setConnectionStatus(status);
			if (status === "connected") {
				const info = ahpConnection.getRemoteInfo();
				setRemoteDefaultDir(info.defaultDirectory);
				setRemoteModels(info.models);
			}
		});
	}, []);

	// Load live sessions from remote host
	const reloadLiveSessions = useCallback(async () => {
		const liveSessions = await ahpConnection.listSessions();
		setSessions(liveSessions);
		if (liveSessions.length > 0) {
			setActiveSessionId(liveSessions[0].id);
		} else {
			setActiveSessionId(null);
		}
	}, []);

	// Subscribe to the active session when it changes in Live Mode
	useEffect(() => {
		if (isMockMode || !activeSessionId || connectionStatus !== "connected") {
			return;
		}

		if (unsubscribeLiveSessionRef.current) {
			unsubscribeLiveSessionRef.current();
			unsubscribeLiveSessionRef.current = null;
		}

		let isSubscribed = true;

		ahpConnection
			.subscribeSession(activeSessionId, (data) => {
				if (!isSubscribed) return;

				if (data.turns !== undefined) {
					setSessions((prev) => prev.map((s) => (s.id === activeSessionId ? { ...s, turns: data.turns || [] } : s)));
				}
				if (data.activeTurn !== undefined) {
					setActiveTurn(data.activeTurn);
				}
				if (data.queuedMessages !== undefined) {
					setSessions((prev) =>
						prev.map((s) => (s.id === activeSessionId ? { ...s, queuedMessages: data.queuedMessages || [] } : s)),
					);
				}
			})
			.then((unsub) => {
				if (isSubscribed) {
					unsubscribeLiveSessionRef.current = unsub;
				} else {
					unsub();
				}
			});

		return () => {
			isSubscribed = false;
			if (unsubscribeLiveSessionRef.current) {
				unsubscribeLiveSessionRef.current();
				unsubscribeLiveSessionRef.current = null;
			}
		};
	}, [isMockMode, activeSessionId, connectionStatus]);

	const activeSession = sessions.find((s) => s.id === activeSessionId) || null;

	const handleSelectSession = (id: string) => {
		if (activeTurn) {
			if (!confirm("A turn is currently streaming. Switch session and cancel it?")) return;
			handleCancelTurn();
		}
		setActiveSessionId(id);
	};

	const handleDisposeSession = async (id: string) => {
		if (!isMockMode && connectionStatus === "connected") {
			try {
				await ahpConnection.disposeSession(id);
			} catch (err) {
				console.warn("disposeSession failed on host:", err);
			}
		}
		setSessions((prev) => prev.filter((s) => s.id !== id));
		if (activeSessionId === id) {
			const remaining = sessions.filter((s) => s.id !== id);
			setActiveSessionId(remaining[0]?.id || null);
		}
	};

	const handleRenameSession = (id: string, newTitle: string) => {
		setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title: newTitle } : s)));
	};

	const handleCreateSession = async (
		title: string,
		workingDirectory: string,
		model: string,
		thinkingLevel: "none" | "low" | "medium" | "high",
	) => {
		if (!isMockMode && connectionStatus === "connected") {
			try {
				const newSessionId = await ahpConnection.createSession({
					title,
					workingDirectory,
					model,
				});

				// Refresh remote sessions
				await reloadLiveSessions();
				setActiveSessionId(newSessionId);
				return;
			} catch (err: any) {
				alert(`Failed to create remote session: ${err?.message || err}`);
				return;
			}
		}

		// Mock mode creation
		const newSession: UiSession = {
			id: `session-${Date.now()}`,
			title,
			workingDirectory,
			modifiedAt: new Date().toISOString(),
			isLive: true,
			isArchived: false,
			model,
			thinkingLevel,
			queuedMessages: [],
			skills: activeSession?.skills || [],
			turns: [],
		};

		setSessions((prev) => [newSession, ...prev]);
		setActiveSessionId(newSession.id);
	};

	const handleSendMessage = async (text: string, isSteering: boolean) => {
		if (!activeSession) return;

		if (!isMockMode && connectionStatus === "connected") {
			if (activeTurn && !isSteering) {
				await ahpConnection.queueMessage(activeSession.id, text);
				setSessions((prev) =>
					prev.map((s) => (s.id === activeSession.id ? { ...s, queuedMessages: [...s.queuedMessages, text] } : s)),
				);
				return;
			}
			if (isSteering && activeTurn) {
				await ahpConnection.steerTurn(activeSession.id, text);
				return;
			}
			const turnId = randomUUID();
			// Optimistically set activeTurn so the prompt immediately renders in the timeline
			setActiveTurn({
				id: turnId,
				userPrompt: text,
				startedAt: new Date().toISOString(),
				model: activeSession.model,
				assistantText: "",
				toolCalls: [],
				state: "streaming",
			});
			await ahpConnection.sendMessage(activeSession.id, text, activeSession.model, turnId);
			return;
		}

		// Mock Mode Execution
		if (activeTurn && !isSteering) {
			setSessions((prev) =>
				prev.map((s) => (s.id === activeSession.id ? { ...s, queuedMessages: [...s.queuedMessages, text] } : s)),
			);
			return;
		}

		if (isSteering && activeTurn) {
			setActiveTurn((prev) =>
				prev
					? {
							...prev,
							assistantText: `${prev.assistantText}\n\n*[Steering guidance received: "${text}"]*\n`,
						}
					: undefined,
			);
			return;
		}

		const turnId = `turn-${Date.now()}`;
		const initialTurn: UiTurn = {
			id: turnId,
			userPrompt: text,
			startedAt: new Date().toISOString(),
			model: activeSession.model,
			assistantText: "",
			toolCalls: [],
			state: "streaming",
		};

		setActiveTurn(initialTurn);

		cancelMockStreamRef.current = simulateTurnStream(
			text,
			activeSession.model,
			activeSession.thinkingLevel,
			(delta) => {
				setActiveTurn((prev) => (prev ? { ...prev, ...delta } : undefined));
			},
			() => {
				setActiveTurn((finalTurn) => {
					if (finalTurn) {
						setSessions((prev) =>
							prev.map((s) =>
								s.id === activeSession.id
									? {
											...s,
											modifiedAt: new Date().toISOString(),
											turns: [...s.turns, finalTurn],
										}
									: s,
							),
						);
					}
					return undefined;
				});

				setTimeout(() => {
					setSessions((prev) => {
						const current = prev.find((s) => s.id === activeSession.id);
						if (current && current.queuedMessages.length > 0) {
							const [nextMsg, ...remainingQueue] = current.queuedMessages;
							const updatedSessions = prev.map((s) =>
								s.id === activeSession.id ? { ...s, queuedMessages: remainingQueue } : s,
							);
							handleSendMessage(nextMsg, false);
							return updatedSessions;
						}
						return prev;
					});
				}, 300);
			},
		);
	};

	const handleCancelTurn = async () => {
		const targetSessionId = activeSession?.id || activeSessionId;
		const turnToCancel = activeTurn;

		// Immediately update local UI so the stop action feels instant and responsive
		if (turnToCancel && targetSessionId) {
			const cancelled: UiTurn = { ...turnToCancel, state: "cancelled" as const };
			setSessions((prev) => prev.map((s) => (s.id === targetSessionId ? { ...s, turns: [...s.turns, cancelled] } : s)));
			setActiveTurn(undefined);
		}

		if (!isMockMode && connectionStatus === "connected" && targetSessionId) {
			await ahpConnection.cancelTurn(targetSessionId, turnToCancel?.id);
			return;
		}

		if (cancelMockStreamRef.current) {
			cancelMockStreamRef.current();
			cancelMockStreamRef.current = null;
		}
	};

	const handleConfirmToolCall = async (toolCallId: string, approved: boolean) => {
		if (!isMockMode && connectionStatus === "connected" && activeSession) {
			await ahpConnection.confirmToolCall(activeSession.id, toolCallId, approved);
			return;
		}

		if (!activeTurn) return;
		setActiveTurn((prev) => {
			if (!prev) return undefined;
			return {
				...prev,
				toolCalls: prev.toolCalls.map((tc) =>
					tc.id === toolCallId
						? {
								...tc,
								status: approved ? "running" : "cancelled",
								result: approved ? "Tool approved by user." : "Tool rejected by user.",
							}
						: tc,
				),
			};
		});
	};

	const handleResumeTurn = () => {
		if (!activeSession) return;
		const lastTurn = activeSession.turns[activeSession.turns.length - 1];
		if (lastTurn?.resumableError) {
			const repaired = { ...lastTurn, resumableError: undefined, state: "streaming" as const };
			setActiveTurn(repaired);
			setSessions((prev) => prev.map((s) => (s.id === activeSession.id ? { ...s, turns: s.turns.slice(0, -1) } : s)));
		}
	};

	/**
	 * Automatically switches from demo mode to live mode when user enters host credentials.
	 * Clears fake demo sessions so that only real live sessions appear!
	 */
	const handleSaveHost = useCallback(
		async (host: HostConfig, mode: StoragePrivacyMode, passphrase?: string) => {
			setCurrentHost(host);
			await vault.init(mode, passphrase);

			// Automatically transition to Live Mode!
			setIsMockMode(false);
			// Clear out fake demo sessions immediately!
			setSessions([]);
			setActiveSessionId(null);
			setActiveTurn(undefined);

			const result = await ahpConnection.connect(host);
			if (result.success) {
				await reloadLiveSessions();
			} else {
				const diag = formatHostConnectionError(host.url, result.error);
				const extra = diag.guidance ? `\n\n${diag.guidance}` : "";
				alert(`${diag.message}${extra}`);
			}
		},
		[reloadLiveSessions],
	);

	// Check URL query parameters on startup for pre-configured host (e.g. from CLI runner)
	useEffect(() => {
		try {
			const params = new URLSearchParams(window.location.search);
			const hostUrl = params.get("host") || params.get("url");
			if (hostUrl) {
				const autoHost: HostConfig = {
					id: "url-host",
					name: "URL Host",
					url: hostUrl,
					isDefault: true,
				};
				handleSaveHost(autoHost, "ephemeral");
			}
		} catch {
			// ignore URL parsing errors
		}
	}, [handleSaveHost]);

	const handleToggleMockMode = async () => {
		if (isMockMode) {
			// Transitioning to Live Mode
			setIsMockMode(false);
			setSessions([]);
			setActiveSessionId(null);
			setActiveTurn(undefined);

			const result = await ahpConnection.connect(currentHost);
			if (result.success) {
				await reloadLiveSessions();
			} else {
				const diag = formatHostConnectionError(currentHost.url, result.error);
				const extra = diag.guidance ? `\n\n${diag.guidance}` : "";
				alert(`${diag.message}${extra}`);
			}
		} else {
			// Transitioning to Demo Mode
			ahpConnection.disconnect();
			setIsMockMode(true);
			const mock = createInitialMockSessions();
			setSessions(mock);
			setActiveSessionId(mock[0]?.id || null);
			setActiveTurn(undefined);
		}
	};

	const handleRemoveQueuedMessage = (index: number) => {
		if (!activeSession) return;
		setSessions((prev) =>
			prev.map((s) =>
				s.id === activeSession.id
					? {
							...s,
							queuedMessages: s.queuedMessages.filter((_, i) => i !== index),
						}
					: s,
			),
		);
	};

	// Model list for session creation: remote models in live mode, sample models in demo mode
	const availableModels: ModelInfo[] =
		!isMockMode && remoteModels.length > 0
			? remoteModels
			: [
					{
						id: "anthropic/claude-3-7-sonnet",
						displayName: "Claude 3.7 Sonnet",
						provider: "anthropic",
						supportsThinking: true,
					},
					{ id: "openai/gpt-4o", displayName: "GPT-4o", provider: "openai" },
					{ id: "deepseek/deepseek-r1", displayName: "DeepSeek R1", provider: "deepseek", supportsThinking: true },
					{ id: "google/gemini-2.5-pro", displayName: "Gemini 2.5 Pro", provider: "google" },
				];

	return (
		<>
			<Header
				status={connectionStatus}
				isMockMode={isMockMode}
				themePreference={themePreference}
				resolvedTheme={resolvedTheme}
				onSetTheme={setTheme}
				onOpenHostModal={() => setIsHostModalOpen(true)}
				onNewSession={() => setIsNewSessionModalOpen(true)}
				onToggleMockMode={handleToggleMockMode}
				onToggleSidebar={() => setIsMobileSidebarOpen((prev) => !prev)}
			/>

			<div className="workspace-layout">
				<Sidebar
					sessions={sessions}
					activeSessionId={activeSessionId}
					isOpen={isMobileSidebarOpen}
					onClose={() => setIsMobileSidebarOpen(false)}
					onSelectSession={handleSelectSession}
					onDisposeSession={handleDisposeSession}
					onRenameSession={handleRenameSession}
				/>

				<main className="chat-view">
					{activeSession ? (
						<>
							<div className="chat-header">
								<div className="chat-header-info">
									<div className="chat-title-row">
										<button
											type="button"
											className="chat-mobile-sidebar-btn"
											onClick={() => setIsMobileSidebarOpen(true)}
											title="View Sessions"
											aria-label="View sessions"
										>
											<svg
												width="14"
												height="14"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												strokeWidth="2.2"
											>
												<line x1="3" y1="12" x2="21" y2="12" />
												<line x1="3" y1="6" x2="21" y2="6" />
												<line x1="3" y1="18" x2="21" y2="18" />
											</svg>
											<span>Sessions ({sessions.length})</span>
										</button>
										<div className="chat-title">{activeSession.title}</div>
									</div>
									<div className="chat-meta">
										<span className="chat-meta-item" title={activeSession.workingDirectory}>
											📁 {activeSession.workingDirectory.split("/").pop() || "workspace"}
										</span>
										<span className="chat-meta-item">⚡ {activeSession.model.split("/").pop()}</span>
										<span className="chat-meta-item">🧠 Thinking: {activeSession.thinkingLevel}</span>
									</div>
								</div>

								<div className="chat-header-actions">
									<button
										type="button"
										className="btn btn-secondary chat-inspector-btn"
										style={{ padding: "5px 10px", fontSize: "12px", whiteSpace: "nowrap" }}
										onClick={() => setIsInspectorOpen((prev) => !prev)}
										title="Toggle Session Inspector"
									>
										<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
											<circle cx="12" cy="12" r="10" />
											<line x1="12" y1="16" x2="12" y2="12" />
											<line x1="12" y1="8" x2="12.01" y2="8" />
										</svg>
										<span className="btn-text-full">{isInspectorOpen ? "Hide Inspector" : "Show Inspector"}</span>
										<span className="btn-text-short">{isInspectorOpen ? "Close" : "Info"}</span>
									</button>
								</div>
							</div>

							<ChatTimeline
								turns={activeSession.turns}
								activeTurn={activeTurn}
								onConfirmToolCall={handleConfirmToolCall}
								onResumeTurn={handleResumeTurn}
							/>

							<Composer
								isStreaming={activeTurn !== undefined}
								skills={activeSession.skills}
								queuedCount={activeSession.queuedMessages.length}
								onSendMessage={handleSendMessage}
								onCancelTurn={handleCancelTurn}
								onOpenQueueModal={() => setIsInspectorOpen(true)}
							/>
						</>
					) : (
						<div style={{ margin: "auto", textAlign: "center", color: "var(--text-muted)" }}>
							<h3>{isMockMode ? "No Active Session" : "Connected to Live Host"}</h3>
							<p style={{ marginTop: "8px" }}>
								{sessions.length === 0
									? 'No sessions exist on this host yet. Click "+ New Session" to launch one.'
									: "Select a session from the sidebar to inspect its timeline."}
							</p>
							{sessions.length === 0 && (
								<button
									type="button"
									className="btn btn-primary"
									style={{ marginTop: "16px" }}
									onClick={() => setIsNewSessionModalOpen(true)}
								>
									+ Create First Session
								</button>
							)}
						</div>
					)}
				</main>

				<Inspector
					session={activeSession}
					onRemoveQueuedMessage={handleRemoveQueuedMessage}
					isOpen={isInspectorOpen}
					onToggle={() => setIsInspectorOpen((prev) => !prev)}
				/>
			</div>

			<HostModal
				currentHost={currentHost}
				isOpen={isHostModalOpen}
				onClose={() => setIsHostModalOpen(false)}
				onSave={handleSaveHost}
			/>

			<NewSessionModal
				isOpen={isNewSessionModalOpen}
				defaultDirectory={remoteDefaultDir}
				availableModels={availableModels}
				onClose={() => setIsNewSessionModalOpen(false)}
				onCreate={handleCreateSession}
			/>
		</>
	);
};
