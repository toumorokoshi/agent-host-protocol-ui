import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ahpConnection } from "./ahp/connection.ts";
import {
	formatHostConnectionError,
	getDefaultHost,
	parseHostFromUrlParams,
	scrubUrlSearchParams,
} from "./ahp/host-utils.ts";
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
	const hasCheckedUrlRef = useRef<boolean>(false);

	const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
	const [isMockMode, setIsMockMode] = useState<boolean>(true); // Starts in Demo Mode until host configured
	const [sessions, setSessions] = useState<UiSession[]>(createInitialMockSessions());
	const [activeSessionId, setActiveSessionId] = useState<string | null>(sessions[0]?.id || null);
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

	const mockStreamsRef = useRef<Map<string, () => void>>(new Map());
	const sessionSubscriptionsRef = useRef<Map<string, () => void>>(new Map());
	const activeSessionIdRef = useRef<string | null>(activeSessionId);
	activeSessionIdRef.current = activeSessionId;
	const sessionsRef = useRef<UiSession[]>(sessions);
	sessionsRef.current = sessions;

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

	const handleSetTheme = useCallback(
		(pref: typeof themePreference) => {
			setTheme(pref);
			const passphrase = activePassphraseRef.current;
			if (passphrase) {
				const config: AppConfiguration = {
					version: 1,
					currentHost,
					savedHosts,
					themePreference: pref,
					lastSavedAt: new Date().toISOString(),
				};
				saveAppConfiguration(config, passphrase).catch(() => {});
			}
		},
		[setTheme, currentHost, savedHosts],
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

			setSessions((prev) => {
				const prevMap = new Map(prev.map((s) => [s.id, s]));
				return allSessions.map((s) => {
					const existing = prevMap.get(s.id);
					if (existing) {
						return {
							...s,
							turns: existing.turns.length > 0 ? existing.turns : s.turns,
							activeTurn: existing.activeTurn ?? s.activeTurn,
							queuedMessages: existing.queuedMessages.length > 0 ? existing.queuedMessages : s.queuedMessages,
						};
					}
					return s;
				});
			});
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

	// Subscribe to active and in-flight sessions in Live Mode
	useEffect(() => {
		if (isMockMode || connectionStatus !== "connected") {
			for (const unsub of sessionSubscriptionsRef.current.values()) {
				unsub();
			}
			sessionSubscriptionsRef.current.clear();
			return;
		}

		if (!activeSessionId) return;

		// Clean up subscriptions for sessions that are:
		// 1. Not the currently active session, AND
		// 2. Not currently running an active turn
		for (const [sessId, unsub] of sessionSubscriptionsRef.current.entries()) {
			if (sessId !== activeSessionId) {
				const sess = sessionsRef.current.find((s) => s.id === sessId);
				if (!sess?.activeTurn) {
					unsub();
					sessionSubscriptionsRef.current.delete(sessId);
				}
			}
		}

		// Subscribe to activeSessionId if not already subscribed
		if (!sessionSubscriptionsRef.current.has(activeSessionId)) {
			const isSubscribed = true;
			const targetId = activeSessionId;

			ahpConnection
				.subscribeSession(targetId, (data) => {
					if (!isSubscribed) return;

					setSessions((prev) =>
						prev.map((s) => {
							if (s.id !== targetId) return s;
							const updated = { ...s };
							if (data.turns !== undefined) {
								updated.turns = data.turns;
							}
							if ("activeTurn" in data) {
								updated.activeTurn = data.activeTurn;
							}
							if (data.queuedMessages !== undefined) {
								updated.queuedMessages = data.queuedMessages;
							}
							if (data.title !== undefined) {
								updated.title = data.title;
							}
							return updated;
						}),
					);

					// If this turn completed on a background session (not currently active),
					// clean up its subscription now that it has finished running.
					if ("activeTurn" in data && !data.activeTurn && activeSessionIdRef.current !== targetId) {
						const currentUnsub = sessionSubscriptionsRef.current.get(targetId);
						if (currentUnsub) {
							currentUnsub();
							sessionSubscriptionsRef.current.delete(targetId);
						}
					}
				})
				.then((unsub) => {
					if (isSubscribed) {
						sessionSubscriptionsRef.current.set(targetId, unsub);
					} else {
						unsub();
					}
				});
		}
	}, [isMockMode, activeSessionId, connectionStatus]);

	// Clean up all subscriptions and mock streams on unmount
	useEffect(() => {
		return () => {
			for (const unsub of sessionSubscriptionsRef.current.values()) {
				unsub();
			}
			sessionSubscriptionsRef.current.clear();
			for (const cancelMock of mockStreamsRef.current.values()) {
				cancelMock();
			}
			mockStreamsRef.current.clear();
		};
	}, []);

	const activeSession = sessions.find((s) => s.id === activeSessionId) || null;
	const activeTurn = activeSession?.activeTurn;

	const handleSelectSession = async (id: string) => {
		// When switching sessions, keep in-flight sessions running in the background without terminating them
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
		const unsub = sessionSubscriptionsRef.current.get(id);
		if (unsub) {
			unsub();
			sessionSubscriptionsRef.current.delete(id);
		}
		const cancelMock = mockStreamsRef.current.get(id);
		if (cancelMock) {
			cancelMock();
			mockStreamsRef.current.delete(id);
		}

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

	const handleSendMessageForSession = async (sessionId: string, text: string, isSteering: boolean) => {
		const targetSession = sessions.find((s) => s.id === sessionId);
		if (!targetSession) return;

		if (!isMockMode && connectionStatus === "connected") {
			if (targetSession.activeTurn && !isSteering) {
				await ahpConnection.queueMessage(sessionId, text);
				setSessions((prev) =>
					prev.map((s) => (s.id === sessionId ? { ...s, queuedMessages: [...s.queuedMessages, text] } : s)),
				);
				return;
			}
			if (isSteering && targetSession.activeTurn) {
				await ahpConnection.steerTurn(sessionId, text);
				return;
			}
			const turnId = randomUUID();
			// Optimistically set activeTurn so the prompt immediately renders in the timeline
			setSessions((prev) =>
				prev.map((s) =>
					s.id === sessionId
						? {
								...s,
								activeTurn: {
									id: turnId,
									userPrompt: text,
									startedAt: new Date().toISOString(),
									model: targetSession.model,
									assistantText: "",
									toolCalls: [],
									state: "streaming",
								},
							}
						: s,
				),
			);
			await ahpConnection.sendMessage(sessionId, text, targetSession.model, turnId);
			return;
		}

		// Mock Mode Execution
		if (targetSession.activeTurn && !isSteering) {
			setSessions((prev) =>
				prev.map((s) => (s.id === sessionId ? { ...s, queuedMessages: [...s.queuedMessages, text] } : s)),
			);
			return;
		}

		if (isSteering && targetSession.activeTurn) {
			setSessions((prev) =>
				prev.map((s) =>
					s.id === sessionId && s.activeTurn
						? {
								...s,
								activeTurn: {
									...s.activeTurn,
									assistantText: `${s.activeTurn.assistantText}\n\n*[Steering guidance received: "${text}"]*\n`,
								},
							}
						: s,
				),
			);
			return;
		}

		const turnId = `turn-${Date.now()}`;
		const initialTurn: UiTurn = {
			id: turnId,
			userPrompt: text,
			startedAt: new Date().toISOString(),
			model: targetSession.model,
			assistantText: "",
			toolCalls: [],
			state: "streaming",
		};
		setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, activeTurn: initialTurn } : s)));

		const cancelFn = simulateTurnStream(
			text,
			targetSession.model,
			targetSession.thinkingLevel,
			(delta) => {
				setSessions((prev) =>
					prev.map((s) =>
						s.id === sessionId && s.activeTurn ? { ...s, activeTurn: { ...s.activeTurn, ...delta } } : s,
					),
				);
			},
			() => {
				mockStreamsRef.current.delete(sessionId);
				setSessions((prev) =>
					prev.map((s) => {
						if (s.id !== sessionId) return s;
						const completedTurn: UiTurn = s.activeTurn
							? { ...s.activeTurn, state: "complete" }
							: {
									id: turnId,
									userPrompt: text,
									startedAt: new Date().toISOString(),
									model: s.model,
									assistantText: "",
									toolCalls: [],
									state: "complete",
								};
						return {
							...s,
							turns: [...s.turns, completedTurn],
							activeTurn: undefined,
							modifiedAt: new Date().toISOString(),
						};
					}),
				);

				// Process next queued message if any
				setTimeout(() => {
					setSessions((prev) => {
						const current = prev.find((s) => s.id === sessionId);
						if (current && current.queuedMessages.length > 0) {
							const [nextPrompt, ...remaining] = current.queuedMessages;
							const updated = prev.map((s) => (s.id === sessionId ? { ...s, queuedMessages: remaining } : s));
							setTimeout(() => handleSendMessageForSession(sessionId, nextPrompt, false), 50);
							return updated;
						}
						return prev;
					});
				}, 500);
			},
		);
		mockStreamsRef.current.set(sessionId, cancelFn);
	};

	const handleSendMessage = async (text: string, isSteering: boolean) => {
		if (!activeSession) return;
		await handleSendMessageForSession(activeSession.id, text, isSteering);
	};

	const handleCancelTurn = async () => {
		if (!activeSession) return;
		const targetSessionId = activeSession.id;
		const turnToCancel = activeSession.activeTurn;

		// Immediately update local UI so the stop action feels instant and responsive
		if (turnToCancel) {
			const cancelled: UiTurn = { ...turnToCancel, state: "cancelled" as const };
			setSessions((prev) =>
				prev.map((s) =>
					s.id === targetSessionId ? { ...s, turns: [...s.turns, cancelled], activeTurn: undefined } : s,
				),
			);
		}

		if (!isMockMode && connectionStatus === "connected") {
			await ahpConnection.cancelTurn(targetSessionId, turnToCancel?.id);
			return;
		}

		const cancelMock = mockStreamsRef.current.get(targetSessionId);
		if (cancelMock) {
			cancelMock();
			mockStreamsRef.current.delete(targetSessionId);
		}
	};

	const handleConfirmToolCall = async (toolCallId: string, approved: boolean) => {
		if (!activeSession) return;
		if (!isMockMode && connectionStatus === "connected") {
			await ahpConnection.confirmToolCall(activeSession.id, toolCallId, approved);
			return;
		}

		if (!activeSession.activeTurn) return;
		setSessions((prev) =>
			prev.map((s) => {
				if (s.id !== activeSession.id || !s.activeTurn) return s;
				return {
					...s,
					activeTurn: {
						...s.activeTurn,
						toolCalls: s.activeTurn.toolCalls.map((tc) =>
							tc.id === toolCallId
								? {
										...tc,
										status: approved ? "running" : "cancelled",
										result: approved ? "Tool approved by user." : "Tool rejected by user.",
									}
								: tc,
						),
					},
				};
			}),
		);
	};

	const handleResumeTurn = () => {
		if (!activeSession) return;
		const lastTurn = activeSession.turns[activeSession.turns.length - 1];
		if (lastTurn?.resumableError) {
			const repaired: UiTurn = { ...lastTurn, resumableError: undefined, state: "streaming" as const };
			setSessions((prev) =>
				prev.map((s) => (s.id === activeSession.id ? { ...s, activeTurn: repaired, turns: s.turns.slice(0, -1) } : s)),
			);
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
			scrubUrlSearchParams();

			// Automatically transition to Live Mode and connect to restored host!
			setIsMockMode(false);
			setSessions([]);
			setActiveSessionId(null);

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
		if (hasCheckedUrlRef.current) return;
		hasCheckedUrlRef.current = true;

		if (typeof window === "undefined") return;

		try {
			const params = new URLSearchParams(window.location.search);
			const hasUrlParam = params.has("host") || params.has("url");
			if (!hasUrlParam) return;

			// If an encrypted vault already exists, preserve it and do not overwrite with ephemeral mode
			if (hasStoredVault()) {
				scrubUrlSearchParams();
				return;
			}

			const isHttps = window.location.protocol === "https:";
			const autoHost = parseHostFromUrlParams(params, isHttps);
			if (autoHost) {
				handleSaveHost(autoHost, "ephemeral");
			}
			scrubUrlSearchParams();
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
				onSetTheme={handleSetTheme}
				onOpenHostModal={() => setIsHostModalOpen(true)}
				onNewSession={() => setIsNewSessionModalOpen(true)}
				onToggleMockMode={handleToggleMockMode}
				onToggleSidebar={() => setIsMobileSidebarOpen((prev) => !prev)}
			/>

			<div className="workspace-layout app-layout">
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
								key={activeSession.id}
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
				isVaultUnlocked={Boolean(activePassphraseRef.current)}
				activePassphrase={activePassphraseRef.current || undefined}
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
