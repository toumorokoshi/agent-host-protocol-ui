import type React from "react";
import { useEffect, useRef, useState } from "react";
import { ahpConnection } from "./ahp/connection.ts";
import { createInitialMockSessions, simulateTurnStream } from "./ahp/mock-host.ts";
import { ChatTimeline } from "./components/ChatTimeline.tsx";
import { Composer } from "./components/Composer.tsx";
import { Header } from "./components/Header.tsx";
import { HostModal } from "./components/HostModal.tsx";
import { Inspector } from "./components/Inspector.tsx";
import { NewSessionModal } from "./components/NewSessionModal.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { type StoragePrivacyMode, vault } from "./crypto/vault.ts";
import type { ConnectionStatus, HostConfig, UiSession, UiTurn } from "./types.ts";

const DEFAULT_HOST: HostConfig = {
	id: "default-local-host",
	name: "Local pi-agent-host",
	url: "ws://127.0.0.1:63877",
	isDefault: true,
};

export const App: React.FC = () => {
	const [currentHost, setCurrentHost] = useState<HostConfig>(DEFAULT_HOST);
	const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
	const [isMockMode, setIsMockMode] = useState<boolean>(true); // Default to Demo Mode for instant POC testing
	const [sessions, setSessions] = useState<UiSession[]>(createInitialMockSessions());
	const [activeSessionId, setActiveSessionId] = useState<string | null>(sessions[0]?.id || null);
	const [activeTurn, setActiveTurn] = useState<UiTurn | undefined>(undefined);
	const [isHostModalOpen, setIsHostModalOpen] = useState(false);
	const [isNewSessionModalOpen, setIsNewSessionModalOpen] = useState(false);
	const [isInspectorOpen, setIsInspectorOpen] = useState(true);

	const cancelStreamRef = useRef<(() => void) | null>(null);

	// Initialize vault on startup
	useEffect(() => {
		vault.init("ephemeral").catch((err) => console.warn("Vault init failed:", err));
	}, []);

	// Listen to connection status changes
	useEffect(() => {
		return ahpConnection.onStatusChange((status) => {
			setConnectionStatus(status);
		});
	}, []);

	const activeSession = sessions.find((s) => s.id === activeSessionId) || null;

	const handleSelectSession = (id: string) => {
		if (activeTurn) {
			if (!confirm("A turn is currently streaming. Switch session and cancel it?")) return;
			handleCancelTurn();
		}
		setActiveSessionId(id);
	};

	const handleDisposeSession = (id: string) => {
		setSessions((prev) => prev.filter((s) => s.id !== id));
		if (activeSessionId === id) {
			const remaining = sessions.filter((s) => s.id !== id);
			setActiveSessionId(remaining[0]?.id || null);
		}
	};

	const handleRenameSession = (id: string, newTitle: string) => {
		setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title: newTitle } : s)));
	};

	const handleCreateSession = (
		title: string,
		workingDirectory: string,
		model: string,
		thinkingLevel: "none" | "low" | "medium" | "high",
	) => {
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

	const handleSendMessage = (text: string, isSteering: boolean) => {
		if (!activeSession) return;

		// If currently generating and not steering, push to queue
		if (activeTurn && !isSteering) {
			setSessions((prev) =>
				prev.map((s) => (s.id === activeSession.id ? { ...s, queuedMessages: [...s.queuedMessages, text] } : s)),
			);
			return;
		}

		// In-flight steering
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

		// Start a new turn
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

		cancelStreamRef.current = simulateTurnStream(
			text,
			activeSession.model,
			activeSession.thinkingLevel,
			(delta) => {
				setActiveTurn((prev) => (prev ? { ...prev, ...delta } : undefined));
			},
			() => {
				// Turn completed: append to session turns
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

				// Check if there are queued messages to trigger
				setTimeout(() => {
					setSessions((prev) => {
						const current = prev.find((s) => s.id === activeSession.id);
						if (current && current.queuedMessages.length > 0) {
							const [nextMsg, ...remainingQueue] = current.queuedMessages;
							const updatedSessions = prev.map((s) =>
								s.id === activeSession.id ? { ...s, queuedMessages: remainingQueue } : s,
							);
							// Trigger next turn
							handleSendMessage(nextMsg, false);
							return updatedSessions;
						}
						return prev;
					});
				}, 300);
			},
		);
	};

	const handleCancelTurn = () => {
		if (cancelStreamRef.current) {
			cancelStreamRef.current();
			cancelStreamRef.current = null;
		}
		if (activeTurn) {
			const cancelled = { ...activeTurn, state: "cancelled" as const };
			setSessions((prev) => prev.map((s) => (s.id === activeSessionId ? { ...s, turns: [...s.turns, cancelled] } : s)));
			setActiveTurn(undefined);
		}
	};

	const handleConfirmToolCall = (toolCallId: string, approved: boolean) => {
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
			// Clear error and resume
			const repaired = { ...lastTurn, resumableError: undefined, state: "streaming" as const };
			setActiveTurn(repaired);
			setSessions((prev) => prev.map((s) => (s.id === activeSession.id ? { ...s, turns: s.turns.slice(0, -1) } : s)));
		}
	};

	const handleSaveHost = async (host: HostConfig, mode: StoragePrivacyMode, passphrase?: string) => {
		setCurrentHost(host);
		await vault.init(mode, passphrase);
		if (!isMockMode) {
			await ahpConnection.connect(host);
		}
	};

	const handleToggleMockMode = async () => {
		if (isMockMode) {
			setIsMockMode(false);
			await ahpConnection.connect(currentHost);
		} else {
			ahpConnection.disconnect();
			setIsMockMode(true);
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

	return (
		<>
			<Header
				currentHost={currentHost}
				status={connectionStatus}
				isMockMode={isMockMode}
				onOpenHostModal={() => setIsHostModalOpen(true)}
				onNewSession={() => setIsNewSessionModalOpen(true)}
				onToggleMockMode={handleToggleMockMode}
			/>

			<div className="workspace-layout">
				<Sidebar
					sessions={sessions}
					activeSessionId={activeSessionId}
					onSelectSession={handleSelectSession}
					onDisposeSession={handleDisposeSession}
					onRenameSession={handleRenameSession}
				/>

				<main className="chat-view">
					{activeSession ? (
						<>
							<div className="chat-header">
								<div className="chat-header-info">
									<div className="chat-title">{activeSession.title}</div>
									<div className="chat-meta">
										<span className="chat-meta-item">📁 {activeSession.workingDirectory}</span>
										<span className="chat-meta-item">⚡ {activeSession.model}</span>
										<span className="chat-meta-item">🧠 Thinking: {activeSession.thinkingLevel}</span>
									</div>
								</div>

								<div>
									<button
										type="button"
										className="btn btn-secondary"
										style={{ padding: "4px 10px", fontSize: "12px" }}
										onClick={() => setIsInspectorOpen((prev) => !prev)}
									>
										{isInspectorOpen ? "Hide Inspector" : "Show Inspector"}
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
							<h3>No Active Session</h3>
							<p style={{ marginTop: "8px" }}>Select a session from the sidebar or create a new one.</p>
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
				onClose={() => setIsNewSessionModalOpen(false)}
				onCreate={handleCreateSession}
			/>
		</>
	);
};
