import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { randomUUID } from "../crypto/uuid.ts";
import type { HostConfig, ModelInfo, UiSession } from "../types.ts";
import { extractDirectoryOptions } from "../utils/directory-options.ts";

export const OTHER_DIRECTORY_VALUE = "__other__";
export const ADD_NEW_AHP_VALUE = "__add_new_ahp__";

interface NewSessionModalProps {
	isOpen: boolean;
	hosts?: HostConfig[];
	activeHostId?: string;
	defaultDirectory: string;
	availableModels: ModelInfo[];
	existingSessions?: UiSession[];
	onClose: () => void;
	onFetchHostInfo?: (host: HostConfig) => Promise<{ defaultDirectory: string; models: ModelInfo[] }>;
	onAddHost?: (newHost: HostConfig) => Promise<{ success: boolean; error?: string; host?: HostConfig }>;
	onCreate: (
		title: string,
		workingDirectory: string,
		model: string,
		thinkingLevel: "none" | "low" | "medium" | "high",
		hostId?: string,
	) => void;
}

export const NewSessionModal: React.FC<NewSessionModalProps> = ({
	isOpen,
	hosts = [],
	activeHostId,
	defaultDirectory,
	availableModels,
	existingSessions = [],
	onClose,
	onFetchHostInfo,
	onAddHost,
	onCreate,
}) => {
	const [selectedHostId, setSelectedHostId] = useState<string>(() => activeHostId || hosts[0]?.id || "default");
	const [title, setTitle] = useState("");
	const [model, setModel] = useState(availableModels[0]?.id || "pi");
	const [thinkingLevel, setThinkingLevel] = useState<"none" | "low" | "medium" | "high">("high");

	// Cache of host metadata (models and defaultDirectory) per host
	const [hostMetadata, setHostMetadata] = useState<Record<string, { defaultDirectory: string; models: ModelInfo[] }>>(
		{},
	);

	// Inline "Add New AHP" state
	const [isAddingHost, setIsAddingHost] = useState(false);
	const [newHostName, setNewHostName] = useState("");
	const [newHostUrl, setNewHostUrl] = useState("");
	const [newHostToken, setNewHostToken] = useState("");
	const [isConnectingNewHost, setIsConnectingNewHost] = useState(false);
	const [newHostError, setNewHostError] = useState("");

	// Identify currently selected host object
	const selectedHost = useMemo(() => {
		return hosts.find((h) => h.id === selectedHostId) || hosts[0];
	}, [hosts, selectedHostId]);

	// Sync activeHostId on open
	useEffect(() => {
		if (isOpen) {
			const initialId = activeHostId || hosts[0]?.id || "default";
			setSelectedHostId(initialId);
			setIsAddingHost(false);
			setNewHostError("");
		}
	}, [isOpen, activeHostId, hosts]);

	// Resolve the active defaultDirectory and models for the selected host
	const resolvedDefaultDir = useMemo(() => {
		if (selectedHost?.id && hostMetadata[selectedHost.id]?.defaultDirectory) {
			return hostMetadata[selectedHost.id].defaultDirectory;
		}
		return selectedHost?.defaultDirectory || defaultDirectory || "/";
	}, [selectedHost, hostMetadata, defaultDirectory]);

	const resolvedModels = useMemo(() => {
		if (selectedHost?.id && hostMetadata[selectedHost.id]?.models?.length) {
			return hostMetadata[selectedHost.id].models;
		}
		if (selectedHost?.models && selectedHost.models.length > 0) {
			return selectedHost.models;
		}
		return availableModels;
	}, [selectedHost, hostMetadata, availableModels]);

	// Directory options for the selected host's sessions
	const directoryOptions = useMemo(() => {
		const hostSessions = existingSessions.filter((s) => !s.hostId || !selectedHost?.id || s.hostId === selectedHost.id);
		return extractDirectoryOptions(resolvedDefaultDir, hostSessions);
	}, [resolvedDefaultDir, existingSessions, selectedHost]);

	const [selectedDirOption, setSelectedDirOption] = useState<string>(() => {
		return directoryOptions[0]?.path || OTHER_DIRECTORY_VALUE;
	});
	const [customCwd, setCustomCwd] = useState<string>(() => {
		return resolvedDefaultDir || "";
	});

	// When selected host or directory options change, update directory selection
	useEffect(() => {
		if (!isOpen) return;

		const initialDefault = directoryOptions[0]?.path;
		if (initialDefault) {
			setSelectedDirOption(initialDefault);
			setCustomCwd(initialDefault);
		} else {
			setSelectedDirOption(OTHER_DIRECTORY_VALUE);
			setCustomCwd(resolvedDefaultDir || "");
		}

		if (resolvedModels.length > 0 && (!model || !resolvedModels.some((m) => m.id === model))) {
			setModel(resolvedModels[0].id);
		}
	}, [isOpen, directoryOptions, resolvedDefaultDir, resolvedModels, model]);

	// Fetch host info dynamically when switching to a host if not already cached
	useEffect(() => {
		if (!isOpen || !selectedHost || !onFetchHostInfo) return;
		if (hostMetadata[selectedHost.id]) return;

		let isSubscribed = true;
		onFetchHostInfo(selectedHost)
			.then((info) => {
				if (!isSubscribed) return;
				setHostMetadata((prev) => ({
					...prev,
					[selectedHost.id]: info,
				}));
			})
			.catch(() => {});

		return () => {
			isSubscribed = false;
		};
	}, [isOpen, selectedHost, onFetchHostInfo, hostMetadata]);

	if (!isOpen) return null;

	const handleHostSelectChange = (val: string) => {
		if (val === ADD_NEW_AHP_VALUE) {
			setIsAddingHost(true);
			setNewHostError("");
			return;
		}
		setIsAddingHost(false);
		setSelectedHostId(val);
	};

	const handleAddNewHostSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!newHostUrl.trim()) return;

		setIsConnectingNewHost(true);
		setNewHostError("");

		const newHostConfig: HostConfig = {
			id: `host-${randomUUID().slice(0, 8)}`,
			name: newHostName.trim() || `Host (${newHostUrl.trim()})`,
			url: newHostUrl.trim(),
			token: newHostToken.trim() || undefined,
		};

		if (onAddHost) {
			const res = await onAddHost(newHostConfig);
			setIsConnectingNewHost(false);
			if (res.success) {
				const added = res.host || newHostConfig;
				setSelectedHostId(added.id);
				setIsAddingHost(false);
				setNewHostName("");
				setNewHostUrl("");
				setNewHostToken("");
			} else {
				setNewHostError(res.error || "Failed to connect to agent host");
			}
		} else {
			setIsConnectingNewHost(false);
			setSelectedHostId(newHostConfig.id);
			setIsAddingHost(false);
		}
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const finalCwd = (selectedDirOption === OTHER_DIRECTORY_VALUE ? customCwd : selectedDirOption).trim();
		if (!finalCwd) return;

		onCreate(title.trim() || "New Agent Session", finalCwd, model, thinkingLevel, selectedHost?.id);
		setTitle("");
		onClose();
	};

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal-card" onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">
					<h3 className="modal-title">New Agent Session</h3>
					<button
						type="button"
						style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
						onClick={onClose}
					>
						✕
					</button>
				</div>

				<form onSubmit={handleSubmit}>
					<div className="modal-body">
						{/* AHP Host Selection */}
						<div className="form-group">
							<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
								<label className="form-label" htmlFor="ahp-host-select">
									Agent Host (AHP)
								</label>
								{!isAddingHost && (
									<button
										type="button"
										style={{
											background: "transparent",
											border: "none",
											color: "var(--accent-primary)",
											fontSize: "12px",
											cursor: "pointer",
											padding: "0 0 4px 0",
										}}
										onClick={() => setIsAddingHost(true)}
									>
										+ Add New AHP
									</button>
								)}
							</div>

							{!isAddingHost ? (
								<select
									id="ahp-host-select"
									className="form-input"
									value={selectedHostId}
									onChange={(e) => handleHostSelectChange(e.target.value)}
								>
									{hosts.map((h) => {
										const cleanUrl = h.url.replace(/\?tkn=.*$/, "").replace(/&tkn=.*$/, "");
										const isCurrent = h.id === activeHostId;
										return (
											<option key={h.id} value={h.id}>
												{h.name} {isCurrent ? "(Connected)" : ""} — {cleanUrl}
											</option>
										);
									})}
									<option value={ADD_NEW_AHP_VALUE}>+ Add New AHP...</option>
								</select>
							) : (
								<div
									style={{
										border: "1px solid var(--border-default)",
										borderRadius: "var(--radius-sm)",
										padding: "10px",
										background: "var(--bg-surface-elevated)",
										marginBottom: "8px",
									}}
								>
									<div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "8px", color: "var(--text-primary)" }}>
										Add Agent Host (AHP)
									</div>
									<div style={{ display: "grid", gap: "8px", marginBottom: "8px" }}>
										<input
											type="text"
											className="form-input"
											placeholder="Host Name (e.g. Tailscale Workstation)"
											value={newHostName}
											onChange={(e) => setNewHostName(e.target.value)}
										/>
										<input
											type="text"
											className="form-input"
											placeholder="WebSocket URL (e.g. ws://100.x.y.z:38232)"
											value={newHostUrl}
											onChange={(e) => setNewHostUrl(e.target.value)}
											required
										/>
										<input
											type="password"
											className="form-input"
											placeholder="Auth Token (optional ?tkn=...)"
											value={newHostToken}
											onChange={(e) => setNewHostToken(e.target.value)}
										/>
									</div>
									{newHostError && (
										<div style={{ color: "var(--color-danger, #f44336)", fontSize: "12px", marginBottom: "8px" }}>
											{newHostError}
										</div>
									)}
									<div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
										<button
											type="button"
											className="btn btn-secondary"
											style={{ padding: "4px 8px", fontSize: "12px" }}
											onClick={() => {
												setIsAddingHost(false);
												setNewHostError("");
											}}
										>
											Cancel
										</button>
										<button
											type="button"
											className="btn btn-primary"
											style={{ padding: "4px 10px", fontSize: "12px" }}
											disabled={isConnectingNewHost || !newHostUrl.trim()}
											onClick={handleAddNewHostSubmit}
										>
											{isConnectingNewHost ? "Connecting..." : "Connect & Add"}
										</button>
									</div>
								</div>
							)}
						</div>

						{/* Session Title */}
						<div className="form-group">
							<label className="form-label">Session Title</label>
							<input
								type="text"
								className="form-input"
								placeholder="e.g. Implement feature"
								value={title}
								onChange={(e) => setTitle(e.target.value)}
							/>
						</div>

						{/* Working Directory */}
						<div className="form-group">
							<label className="form-label" htmlFor="working-directory-select">
								Working Directory ({selectedHost?.name || "Selected AHP"})
							</label>
							{directoryOptions.length > 0 ? (
								<>
									<select
										id="working-directory-select"
										className="form-input"
										value={selectedDirOption}
										onChange={(e) => {
											const val = e.target.value;
											setSelectedDirOption(val);
											if (val !== OTHER_DIRECTORY_VALUE) {
												setCustomCwd(val);
											}
										}}
									>
										<optgroup label="Existing Directories">
											{directoryOptions.map((opt) => (
												<option key={opt.path} value={opt.path}>
													{opt.label}
												</option>
											))}
										</optgroup>
										<option value={OTHER_DIRECTORY_VALUE}>Other (enter custom directory)...</option>
									</select>

									{selectedDirOption === OTHER_DIRECTORY_VALUE ? (
										<div style={{ marginTop: "6px" }}>
											<input
												type="text"
												className="form-input"
												placeholder="/path/to/project"
												value={customCwd}
												onChange={(e) => setCustomCwd(e.target.value)}
												required
											/>
											<span
												style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginTop: "4px" }}
											>
												Enter an absolute path on {selectedHost?.name || "the remote host"}.
											</span>
										</div>
									) : (
										<span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
											Selected directory: <code>{selectedDirOption}</code>
										</span>
									)}
								</>
							) : (
								<>
									<input
										type="text"
										className="form-input"
										placeholder="/path/to/project"
										value={customCwd}
										onChange={(e) => setCustomCwd(e.target.value)}
										required
									/>
									<span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
										Host default directory: <code>{resolvedDefaultDir || "/"}</code>
									</span>
								</>
							)}
						</div>

						{/* Model Provider & Model */}
						<div className="form-group">
							<label className="form-label">Model ({selectedHost?.name || "Remote Host"})</label>
							{resolvedModels.length > 0 ? (
								<select className="form-input" value={model} onChange={(e) => setModel(e.target.value)}>
									{resolvedModels.map((m) => (
										<option key={m.id} value={m.id}>
											{m.displayName} ({m.provider})
										</option>
									))}
								</select>
							) : (
								<input
									type="text"
									className="form-input"
									placeholder="e.g. anthropic/claude-3-7-sonnet"
									value={model}
									onChange={(e) => setModel(e.target.value)}
									required
								/>
							)}
						</div>

						{/* Thinking Level */}
						<div className="form-group">
							<label className="form-label">Reasoning Effort / Thinking Level</label>
							<select
								className="form-input"
								value={thinkingLevel}
								onChange={(e) => setThinkingLevel(e.target.value as "none" | "low" | "medium" | "high")}
							>
								<option value="high">High (Thorough chain-of-thought)</option>
								<option value="medium">Medium</option>
								<option value="low">Low</option>
								<option value="none">None (Standard generation)</option>
							</select>
						</div>
					</div>

					<div className="modal-footer">
						<button type="button" className="btn btn-secondary" onClick={onClose}>
							Cancel
						</button>
						<button type="submit" className="btn btn-primary">
							Create Session
						</button>
					</div>
				</form>
			</div>
		</div>
	);
};
