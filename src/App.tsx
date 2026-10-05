import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ahpConnection } from "./ahp/connection.ts";
import { formatHostConnectionError, getDefaultHost } from "./ahp/host-utils.ts";
import { createInitialMockSessions, simulateTurnStream } from "./ahp/mock-host.ts";
import { multiAhp } from "./ahp/multi-connection.ts";
import { ChatTimeline } from "./components/ChatTimeline.tsx";
import { Composer } from "./components/Composer.tsx";
import { Header } from "./components/Header.tsx";
import { HostModal } from "./components/HostModal.tsx";
import { Inspector } from "./components/Inspector.tsx";
import { NewSessionModal } from "./components/NewSessionModal.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { Tooltip } from "./components/Tooltip.tsx";
import { UnlockVaultModal } from "./components/UnlockVaultModal.tsx";
import { clearStoredVault, hasStoredVault, saveAppConfiguration, unlockAppConfiguration } from "./crypto/app-config.ts";
import { randomUUID } from "./crypto/uuid.ts";
import { type StoragePrivacyMode, vault } from "./crypto/vault.ts";
import { useTheme } from "./hooks/useTheme.ts";
import type { AppConfiguration, ConnectionStatus, HostConfig, ModelInfo, UiSession, UiTurn } from "./types.ts";
import { formatDirectoryBase, formatDirectoryTooltip } from "./utils/format-session-dir.ts";

const DEMO_HOSTS: HostConfig[] = [
	{
		id: "local-demo",
		name: "Localhost (Demo)",
		url: "ws://127.0.0.1:63877",
		isDefault: true,
		defaultDirectory: "/Users/TZTWH7/workspace/agent-host-protocol-ui",
		models: [
			{
				id: "anthropic/claude-3-7-sonnet",
				displayName: "Claude 3.7 Sonnet",
				provider: "anthropic",
				supportsThinking: true,
			},
			{ id: "pi", displayName: "Default (Pi)", provider: "pi", supportsThinking: true },
		],
	},
	{
		id: "ts-demo",
		name: "Tailscale Machine (Demo)",
		url: "ws://100.115.92.2:38232",
		defaultDirectory: "/home/yusuke/projects",
		models: [
			{ id: "openai/gpt-4o", displayName: "GPT-4o", provider: "openai", supportsThinking: true },
			{ id: "meta/llama-3.3-70b", displayName: "Llama 3.3 70B", provider: "meta", supportsThinking: true },
		],
	},
];

export const App: React.FC = () => {
	const { themePreference, resolvedTheme, setTheme } = useTheme();
	const [currentHost, setCurrentHost] = useState<HostConfig>(getDefaultHost);
	const [savedHosts, setSavedHosts] = useState<HostConfig[]>(() => [getDefaultHost()]);
	const activePassphraseRef = useRef<string | null>(null);

	const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
	const [isMockMode, setIsMockMode] = useState<boolean>(true); // Starts in Demo Mode until host configured
	const [sessions, setSessions] = useState<UiSession[]>(createInitialMockSessions());
	const [activeSessionId, setActiveSessionId] = useState<string | null>(sessions[0]?.id || null);
	const [activeTurn, setActiveTurn] = useState<UiTurn | undefined>(undefined);
	const [isHostModalOpen, setIsHostModalOpen] = useState(false);
	const [isNewSessionModalOpen, setIsNewSessionModalOpen] = useState(false);
	const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
	const [isInspectorOpen, setIsInspectorOpen] = useState(
		() => typeof window !== "undefined" && window.innerWidth > 768,
	);
	const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

	// Remote metadata for currently connected host
	const [remoteDefaultDir, setRemoteDefaultDir] = useState<string>("");
	const [remoteModels, setRemoteModels] = useState<ModelInfo[]>([]);

	const cancelMockStreamRef = useRef<(() => void) | null>(null);
	const unsubscribeLiveSessionRef = useRef<(() => void) | null>(null);

	// Helper to persist all configured hosts and settings behind the common passphrase
	const persistConfiguration = useCallback(
		async (hostToSave: HostConfig, hostsToSave: HostConfig[]) => {
			const passphrase = activePassphraseRef.current;
			if (!passphrase) return;
			const config: AppConfiguration = {
				version: 1,
				currentHost: hostToSave,
				savedHosts: hostsToSave,
				themePreference,
				lastSavedAt: new Date().toISOString(),
			};
			await saveAppConfiguration(config, passphrase);
		},
		[themePreference],
	);

	// Initialize vault on startup; if an encrypted vault exists, prompt user to unlock
	useEffect(() => {
		if (hasStoredVault()) {
			setIsUnlockModalOpen(true);
		} else {
			vault.init("ephemeral").catch((err) => console.warn("Vault init failed:", err));
		}
	}, []);

	// Listen to connection status changes on the primary active connection
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

	// Load live sessions from primary host and any other saved hosts
	const reloadLiveSessions = useCallback(
		async (targetHost?: HostConfig, additionalHosts?: HostConfig[]) => {
			const primary = targetHost || currentHost;
			const primarySessions = await ahpConnection.listSessions();
			const taggedPrimary: UiSession[] = primarySessions.map((s) => ({
				...s,
				hostId: primary.id,
				hostName: primary.name,
			}));

			let allSessions: UiSession[] = [...taggedPrimary];
			const others = (additionalHosts || savedHosts).filter((h) => h.id !== primary.id);
			for (const other of others) {
				try {
					const otherSessions = await multiAhp.listSessionsForHost(other);
					allSessions = [...allSessions, ...otherSessions];
				} catch {
					// Ignore unreachable hosts in background poll
				}
			}

			setSessions(allSessions);
			if (allSessions.length > 0) {
				setActiveSessionId((prev) => {
					if (prev && allSessions.some((s) => s.id === prev)) return prev;
					return allSessions[0].id;
				});
			} else {
				setActiveSessionId(null);
			}
		},
		[currentHost, savedHosts],
	);

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

	const handleSelectSession = async (id: string) => {
		if (activeTurn) {
			if (!confirm("A turn is currently streaming. Switch session and cancel it?")) return;
			handleCancelTurn();
		}

		const targetSession = sessions.find((s) => s.id === id);
		if (targetSession?.hostId && targetSession.hostId !== currentHost.id) {
			const targetHost = savedHosts.find((h) => h.id === targetSession.hostId);
			if (targetHost) {
				setCurrentHost(targetHost);
				if (!isMockMode) {
					await ahpConnection.connect(targetHost);
				}
			}
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
		hostId?: string,
	) => {
		const targetHost = (hostId ? savedHosts.find((h) => h.id === hostId) : null) || currentHost;

		if (!isMockMode) {
			try {
				if (targetHost.id !== currentHost.id) {
					setCurrentHost(targetHost);
					await ahpConnection.connect(targetHost);
				}

				const newSessionId = await ahpConnection.createSession({
					title,
					workingDirectory,
					model,
				});

				// Refresh remote sessions
				await reloadLiveSessions(targetHost);
				setActiveSessionId(newSessionId);
				return;
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : String(err);
				alert(`Failed to create remote session on ${targetHost.name}: ${msg}`);
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
			hostId: targetHost.id,
			hostName: targetHost.name,
		};

		setSessions((prev) => [newSession, ...prev]);
		setActiveSessionId(newSession.id);
	};

	const handleFetchHostInfo = useCallback(
		async (host: HostConfig): Promise<{ defaultDirectory: string; models: ModelInfo[] }> => {
			if (isMockMode) {
				if (host.id === "ts-demo") {
					return {
						defaultDirectory: "/home/yusuke/projects",
						models: [
							{ id: "openai/gpt-4o", displayName: "GPT-4o", provider: "openai", supportsThinking: true },
							{ id: "meta/llama-3.3-70b", displayName: "Llama 3.3 70B", provider: "meta", supportsThinking: true },
						],
					};
				}
				return {
					defaultDirectory: "/Users/TZTWH7/workspace/agent-host-protocol-ui",
					models: [
						{
							id: "anthropic/claude-3-7-sonnet",
							displayName: "Claude 3.7 Sonnet",
							provider: "anthropic",
							supportsThinking: true,
						},
						{ id: "pi", displayName: "Default (Pi)", provider: "pi", supportsThinking: true },
					],
				};
			}

			const info = await multiAhp.fetchHostInfo(host);
			setSavedHosts((prev) =>
				prev.map((h) =>
					h.id === host.id ? { ...h, defaultDirectory: info.defaultDirectory, models: info.models } : h,
				),
			);
			return info;
		},
		[isMockMode],
	);

	const handleAddHostFromModal = useCallback(
		async (newHost: HostConfig): Promise<{ success: boolean; error?: string; host?: HostConfig }> => {
			if (isMockMode) {
				// Switch to Live Mode upon configuring a real host
				setIsMockMode(false);
				setSessions([]);
				setActiveSessionId(null);
				setActiveTurn(undefined);

				const res = await multiAhp.connectHost(newHost);
				if (!res.success) {
					return { success: false, error: res.error || "Connection to host failed" };
				}
				const conn = multiAhp.getConnection(newHost.id);
				const info = conn?.getRemoteInfo();
				const enriched: HostConfig = {
					...newHost,
					defaultDirectory: info?.defaultDirectory,
					models: info?.models,
				};
				const updated = [enriched];
				setSavedHosts(updated);
				setCurrentHost(enriched);
				await ahpConnection.connect(enriched);
				await reloadLiveSessions(enriched, updated);
				await persistConfiguration(enriched, updated);
				return { success: true, host: enriched };
			}

			const res = await multiAhp.connectHost(newHost);
			if (!res.success) {
				return { success: false, error: res.error || "Connection to host failed" };
			}
			const conn = multiAhp.getConnection(newHost.id);
			const info = conn?.getRemoteInfo();
			const enriched: HostConfig = {
				...newHost,
				defaultDirectory: info?.defaultDirectory,
				models: info?.models,
			};

			const updated = [...savedHosts, enriched];
			setSavedHosts(updated);
			await persistConfiguration(currentHost, updated);
			return { success: true, host: enriched };
		},
		[savedHosts, currentHost, isMockMode, persistConfiguration, reloadLiveSessions],
	);

	const handleDeleteHost = useCallback(
		async (hostId: string) => {
			if (savedHosts.length <= 1) return;
			const updatedHosts = savedHosts.filter((h) => h.id !== hostId);
			setSavedHosts(updatedHosts);
			multiAhp.disconnectHost(hostId);

			let nextCurrent = currentHost;
			if (currentHost.id === hostId) {
				nextCurrent = updatedHosts[0];
				setCurrentHost(nextCurrent);
				if (!isMockMode) {
					await ahpConnection.connect(nextCurrent);
					await reloadLiveSessions(nextCurrent, updatedHosts);
				}
			}

			await persistConfiguration(nextCurrent, updatedHosts);
		},
		[savedHosts, currentHost, isMockMode, reloadLiveSessions, persistConfiguration],
	);

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
											turns: [...s.turns, { ...finalTurn, state: "complete" }],
											modifiedAt: new Date().toISOString(),
										}
									: s,
							),
						);
					}
					return undefined;
				});

				// Process next queued message if any
				setTimeout(() => {
					setSessions((prev) => {
						const current = prev.find((s) => s.id === activeSession.id);
						if (current && current.queuedMessages.length > 0) {
							const [nextPrompt, ...remaining] = current.queuedMessages;
							const updated = prev.map((s) => (s.id === activeSession.id ? { ...s, queuedMessages: remaining } : s));
							setTimeout(() => handleSendMessage(nextPrompt, false), 50);
							return updated;
						}
						return prev;
					});
				}, 500);
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

	const handleUnlockVault = async (passphrase: string): Promise<{ success: boolean; error?: string }> => {
		try {
			const config = await unlockAppConfiguration(passphrase);
			if (!config) {
				return { success: false, error: "Incorrect passphrase. Please try again." };
			}

			activePassphraseRef.current = passphrase;

			const hosts = config.savedHosts && config.savedHosts.length > 0 ? config.savedHosts : [config.currentHost];
			setSavedHosts(hosts);
			setCurrentHost(config.currentHost);
			if (config.themePreference) {
				setTheme(config.themePreference);
			}
			setIsUnlockModalOpen(false);

			// Automatically transition to Live Mode and connect to restored host!
			setIsMockMode(false);
			setSessions([]);
			setActiveSessionId(null);
			setActiveTurn(undefined);

			const result = await ahpConnection.connect(config.currentHost);
			if (result.success) {
				await reloadLiveSessions(config.currentHost, hosts);
			} else {
				const diag = formatHostConnectionError(config.currentHost.url, result.error);
				const extra = diag.guidance ? `\n\n${diag.guidance}` : "";
				alert(`${diag.message}${extra}`);
			}

			return { success: true };
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : "Failed to decrypt configuration";
			return { success: false, error: msg };
		}
	};

	const handleSkipUnlock = () => {
		setIsUnlockModalOpen(false);
		vault.init("ephemeral").catch(() => {});
	};

	const handleResetVault = () => {
		if (
			typeof window !== "undefined" &&
			window.confirm(
				"Are you sure you want to reset your stored configuration? This will delete all encrypted credentials from this browser.",
			)
		) {
			clearStoredVault();
			setIsUnlockModalOpen(false);
			vault.init("ephemeral").catch(() => {});
		}
	};

	const handleSaveHost = useCallback(
		async (host: HostConfig, mode: StoragePrivacyMode, passphrase?: string, allHosts?: HostConfig[]) => {
			if (passphrase) {
				activePassphraseRef.current = passphrase;
			}

			const updatedHosts = allHosts && allHosts.length > 0 ? allHosts : [host];
			if (!updatedHosts.some((h) => h.id === host.id)) {
				updatedHosts.push(host);
			}

			setSavedHosts(updatedHosts);
			setCurrentHost(host);

			const activePass = passphrase || activePassphraseRef.current;
			if (mode === "passphrase" && activePass) {
				const config: AppConfiguration = {
					version: 1,
					currentHost: host,
					savedHosts: updatedHosts,
					themePreference,
					lastSavedAt: new Date().toISOString(),
				};
				await saveAppConfiguration(config, activePass);
			} else if (mode !== "passphrase") {
				activePassphraseRef.current = null;
				clearStoredVault();
				await vault.init(mode);
			}

			// Automatically transition to Live Mode!
			setIsMockMode(false);
			setSessions([]);
			setActiveSessionId(null);
			setActiveTurn(undefined);

			const result = await ahpConnection.connect(host);
			if (result.success) {
				await reloadLiveSessions(host, updatedHosts);
			} else {
				const diag = formatHostConnectionError(host.url, result.error);
				const extra = diag.guidance ? `\n\n${diag.guidance}` : "";
				alert(`${diag.message}${extra}`);
			}
		},
		[themePreference, reloadLiveSessions],
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
				await reloadLiveSessions(currentHost, savedHosts);
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
				s.id === activeSession.id ? { ...s, queuedMessages: s.queuedMessages.filter((_, i) => i !== index) } : s,
			),
		);
	};

	const availableModels =
		remoteModels.length > 0
			? remoteModels
			: activeSession
				? [
						{
							id: activeSession.model,
							displayName: activeSession.model.split("/").pop() || activeSession.model,
							provider: activeSession.model.split("/")[0] || "custom",
							supportsThinking: true,
						},
					]
				: [];

	const effectiveHosts = isMockMode ? DEMO_HOSTS : savedHosts;

	return (
		<>
			<Header
				status={connectionStatus}
				isMockMode={isMockMode}
				activeHostName={currentHost.name}
				themePreference={themePreference}
				resolvedTheme={resolvedTheme}
				onSetTheme={setTheme}
				onOpenHostModal={() => setIsHostModalOpen(true)}
				onNewSession={() => setIsNewSessionModalOpen(true)}
				onToggleMockMode={handleToggleMockMode}
				onToggleSidebar={() => setIsMobileSidebarOpen((prev) => !prev)}
			/>

			<div className="app-layout">
				<Sidebar
					sessions={sessions}
					activeSessionId={activeSessionId}
					onSelectSession={handleSelectSession}
					onDisposeSession={handleDisposeSession}
					onRenameSession={handleRenameSession}
					isOpen={isMobileSidebarOpen}
					onClose={() => setIsMobileSidebarOpen(false)}
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
										{activeSession.hostName && (
											<span className="chat-meta-item" title={`Connected AHP: ${activeSession.hostName}`}>
												🌐 {activeSession.hostName}
											</span>
										)}
										<Tooltip content={formatDirectoryTooltip(activeSession.workingDirectory)}>
											<span className="chat-meta-item" style={{ cursor: "pointer" }}>
												📁 {formatDirectoryBase(activeSession.workingDirectory)}
											</span>
										</Tooltip>
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
				savedHosts={savedHosts}
				isOpen={isHostModalOpen}
				onClose={() => setIsHostModalOpen(false)}
				onSave={handleSaveHost}
				onDeleteHost={handleDeleteHost}
			/>

			<NewSessionModal
				isOpen={isNewSessionModalOpen}
				hosts={effectiveHosts}
				activeHostId={currentHost.id}
				defaultDirectory={remoteDefaultDir}
				availableModels={availableModels}
				existingSessions={sessions}
				onClose={() => setIsNewSessionModalOpen(false)}
				onFetchHostInfo={handleFetchHostInfo}
				onAddHost={handleAddHostFromModal}
				onCreate={handleCreateSession}
			/>

			<UnlockVaultModal
				isOpen={isUnlockModalOpen}
				onUnlock={handleUnlockVault}
				onSkip={handleSkipUnlock}
				onReset={handleResetVault}
			/>
		</>
	);
};
