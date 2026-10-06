import type React from "react";
import { useEffect, useState } from "react";
import { formatIpv6Url } from "../ahp/host-utils.ts";
import { hasStoredVault, unlockAppConfiguration } from "../crypto/app-config.ts";
import { randomUUID } from "../crypto/uuid.ts";
import type { StoragePrivacyMode } from "../crypto/vault.ts";
import type { HostConfig } from "../types.ts";

interface PasswordCredentialData {
	id: string;
	password: string;
	name?: string;
}

interface WebPasswordCredential extends Credential {
	readonly password?: string;
	readonly name?: string;
}

declare global {
	interface Window {
		PasswordCredential?: new (data: PasswordCredentialData) => Credential;
	}
}

interface HostModalProps {
	currentHost: HostConfig;
	savedHosts?: HostConfig[];
	isOpen: boolean;
	onClose: () => void;
	onSave: (host: HostConfig, mode: StoragePrivacyMode, passphrase?: string, allHosts?: HostConfig[]) => void;
	onDeleteHost?: (hostId: string) => void;
}

export const HostModal: React.FC<HostModalProps> = ({
	currentHost,
	savedHosts = [],
	isOpen,
	onClose,
	onSave,
	onDeleteHost,
}) => {
	const [hostsList, setHostsList] = useState<HostConfig[]>(() => {
		const base = savedHosts.length > 0 ? [...savedHosts] : [currentHost];
		if (!base.some((h) => h.id === currentHost.id)) {
			base.unshift(currentHost);
		}
		return base;
	});

	const [editingHostId, setEditingHostId] = useState<string>(currentHost.id);
	const [activeHostId, setActiveHostId] = useState<string>(currentHost.id);

	const [name, setName] = useState(currentHost.name);
	const [url, setUrl] = useState(currentHost.url);
	const [token, setToken] = useState(currentHost.token || "");
	const [showPassword, setShowPassword] = useState(false);
	const [mode, setMode] = useState<StoragePrivacyMode>("ephemeral");
	const [passphrase, setPassphrase] = useState("");
	const [hasEncryptedVault, setHasEncryptedVault] = useState(false);
	const [unlockPassphrase, setUnlockPassphrase] = useState("");
	const [unlockStatus, setUnlockStatus] = useState<"idle" | "success" | "error">("idle");
	const [unlockErrorMessage, setUnlockErrorMessage] = useState("");

	useEffect(() => {
		if (!isOpen) return;

		const base = savedHosts.length > 0 ? [...savedHosts] : [currentHost];
		if (!base.some((h) => h.id === currentHost.id)) {
			base.unshift(currentHost);
		}
		setHostsList(base);
		setEditingHostId(currentHost.id);
		setActiveHostId(currentHost.id);

		setName(currentHost.name);
		setUrl(currentHost.url);
		setToken(currentHost.token || "");

		if (hasStoredVault()) {
			setHasEncryptedVault(true);
			setMode("passphrase");
		} else {
			setHasEncryptedVault(false);
		}

		if (
			typeof window !== "undefined" &&
			navigator.credentials &&
			!currentHost.token &&
			(!currentHost.url || currentHost.url === "ws://127.0.0.1:63877")
		) {
			navigator.credentials
				.get({ password: true, mediation: "optional" } as CredentialRequestOptions)
				.then((cred) => {
					const passwordCred = cred as WebPasswordCredential | null;
					if (passwordCred?.id && passwordCred.password) {
						setUrl(passwordCred.id);
						setToken(passwordCred.password);
						if (passwordCred.name && passwordCred.name !== passwordCred.id) {
							setName(passwordCred.name);
						}
					}
				})
				.catch(() => {});
		}
	}, [isOpen, currentHost, savedHosts]);

	const selectHostToEdit = (host: HostConfig) => {
		setEditingHostId(host.id);
		setName(host.name);
		setUrl(host.url);
		setToken(host.token || "");
	};

	const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
	const currentHostname = typeof window !== "undefined" ? window.location.hostname : "";
	const isNonLocalOrigin =
		Boolean(currentHostname) &&
		currentHostname !== "localhost" &&
		currentHostname !== "127.0.0.1" &&
		currentHostname !== "::1" &&
		currentHostname !== "[::1]";
	const isLoopbackTarget = url.includes("127.0.0.1") || url.includes("localhost");
	const isMixedContentTarget = isHttps && url.trim().startsWith("ws://");
	const isTailscaleHost =
		currentHostname.includes(".ts.net") ||
		url.includes(".ts.net") ||
		currentHostname.startsWith("100.") ||
		url.includes("100.");

	const startAddingNewHost = () => {
		const newId = `host-${randomUUID().slice(0, 8)}`;
		setEditingHostId(newId);
		setName("");
		setUrl(isHttps ? "wss://" : "ws://");
		setToken("");
	};

	const removeHost = (idToRemove: string) => {
		if (hostsList.length <= 1) return;
		const updated = hostsList.filter((h) => h.id !== idToRemove);
		setHostsList(updated);
		if (onDeleteHost) onDeleteHost(idToRemove);

		if (editingHostId === idToRemove) {
			selectHostToEdit(updated[0]);
		}
		if (activeHostId === idToRemove) {
			setActiveHostId(updated[0].id);
		}
	};

	const handleUnlockVault = async () => {
		if (!unlockPassphrase.trim()) return;
		try {
			const config = await unlockAppConfiguration(unlockPassphrase.trim());
			if (config?.currentHost?.url) {
				const restoredHosts =
					config.savedHosts && config.savedHosts.length > 0 ? config.savedHosts : [config.currentHost];
				setHostsList(restoredHosts);
				setActiveHostId(config.currentHost.id);
				selectHostToEdit(config.currentHost);
				setMode("passphrase");
				setPassphrase(unlockPassphrase.trim());
				setUnlockStatus("success");
				setUnlockErrorMessage("");
			} else {
				setUnlockStatus("error");
				setUnlockErrorMessage("Incorrect passphrase or corrupt vault data.");
			}
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : "Invalid passphrase";
			setUnlockStatus("error");
			setUnlockErrorMessage(`Failed to decrypt vault: ${msg}`);
		}
	};

	if (!isOpen) return null;

	const handleUrlChange = (val: string) => {
		try {
			if (val.includes("?tkn=") || val.includes("?token=") || val.includes("&tkn=")) {
				const isSecure = val.startsWith("wss://") || val.startsWith("https://");
				const tempUrl = val.replace(/^(?:wss|ws|https|http):\/\//, "http://");
				const parsed = new URL(tempUrl);
				const tkn = parsed.searchParams.get("tkn") || parsed.searchParams.get("token");
				if (tkn) {
					parsed.searchParams.delete("tkn");
					parsed.searchParams.delete("token");
					const cleanProto = isSecure || isHttps ? "wss://" : "ws://";
					const cleanHost = parsed.host;
					const cleanPath = parsed.pathname === "/" && !val.includes(`${cleanHost}/`) ? "" : parsed.pathname;
					const cleanUrl = `${cleanProto}${cleanHost}${cleanPath}`;
					setUrl(cleanUrl);
					setToken(tkn);
					return;
				}
			}
		} catch {
			// Fall through
		}
		setUrl(val);
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();

		let cleanUrl = url.trim();
		if (cleanUrl.startsWith("http://")) {
			cleanUrl = `${isHttps ? "wss://" : "ws://"}${cleanUrl.slice(7)}`;
		} else if (cleanUrl.startsWith("https://")) {
			cleanUrl = `wss://${cleanUrl.slice(8)}`;
		} else if (!cleanUrl.startsWith("ws://") && !cleanUrl.startsWith("wss://") && cleanUrl.length > 0) {
			cleanUrl = `${isHttps ? "wss://" : "ws://"}${cleanUrl}`;
		}
		cleanUrl = formatIpv6Url(cleanUrl);

		if (isHttps && cleanUrl.startsWith("ws://")) {
			alert(
				"Mixed Content Notice: Cannot connect to an unencrypted ws:// endpoint from a page loaded over HTTPS.\n\n" +
					"Please switch to wss:// or access this UI over plain HTTP (e.g. via Tailscale IP http://100.x.y.z:5173).",
			);
			return;
		}

		const cleanToken = token.trim();
		const cleanName = name.trim() || `Host (${cleanUrl})`;

		// Update or append the editing host in hostsList
		const existingIndex = hostsList.findIndex((h) => h.id === editingHostId);
		const updatedHost: HostConfig = {
			id: editingHostId,
			name: cleanName,
			url: cleanUrl,
			token: cleanToken || undefined,
		};

		let updatedHosts: HostConfig[];
		if (existingIndex >= 0) {
			updatedHosts = [...hostsList];
			updatedHosts[existingIndex] = {
				...updatedHosts[existingIndex],
				...updatedHost,
			};
		} else {
			updatedHosts = [...hostsList, updatedHost];
		}

		// Save credentials into browser's native password manager
		if (typeof window !== "undefined" && window.PasswordCredential && navigator.credentials && cleanToken) {
			try {
				const cred = new window.PasswordCredential({
					id: cleanUrl,
					password: cleanToken,
					name: cleanName,
				});
				navigator.credentials.store(cred).catch(() => {});
			} catch {
				// Ignore
			}
		}

		// The target active host is the edited host (or activeHostId if different)
		const targetActive = updatedHosts.find((h) => h.id === editingHostId) || updatedHost;

		onSave(targetActive, mode, passphrase, updatedHosts);
		onClose();
	};

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "560px" }}>
				<div className="modal-header">
					<h3 className="modal-title">Configure Agent Hosts (AHP)</h3>
					<button
						type="button"
						style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
						onClick={onClose}
					>
						✕
					</button>
				</div>

				<form onSubmit={handleSubmit} method="post" autoComplete="on">
					<div className="modal-body">
						{/* Saved Hosts List */}
						<div className="form-group">
							<div
								style={{
									display: "flex",
									justifyContent: "space-between",
									alignItems: "center",
									marginBottom: "6px",
								}}
							>
								<label className="form-label" style={{ margin: 0 }}>
									Configured Hosts ({hostsList.length})
								</label>
								<button
									type="button"
									style={{
										background: "transparent",
										border: "none",
										color: "var(--accent-primary)",
										fontSize: "12px",
										cursor: "pointer",
									}}
									onClick={startAddingNewHost}
								>
									+ Add Host
								</button>
							</div>

							<div
								style={{
									display: "grid",
									gap: "6px",
									maxHeight: "150px",
									overflowY: "auto",
									border: "1px solid var(--border-default)",
									borderRadius: "var(--radius-sm)",
									padding: "6px",
									background: "var(--bg-canvas)",
								}}
							>
								{hostsList.map((h) => {
									const isEditing = h.id === editingHostId;
									const isActive = h.id === activeHostId;
									const cleanUrl = h.url.replace(/\?tkn=.*$/, "").replace(/&tkn=.*$/, "");
									return (
										<div
											key={h.id}
											style={{
												display: "flex",
												alignItems: "center",
												justifyContent: "space-between",
												padding: "6px 8px",
												borderRadius: "4px",
												background: isEditing ? "var(--bg-surface-elevated)" : "transparent",
												border: isEditing ? "1px solid var(--accent-primary)" : "1px solid transparent",
												cursor: "pointer",
											}}
											onClick={() => selectHostToEdit(h)}
										>
											<div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
												<span style={{ fontWeight: 600, fontSize: "12px", color: "var(--text-primary)" }}>
													{h.name || "Untitled"}
												</span>
												<span
													style={{
														fontSize: "11px",
														color: "var(--text-muted)",
														marginLeft: "8px",
														fontFamily: "var(--font-mono)",
													}}
												>
													{cleanUrl}
												</span>
											</div>
											<div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
												{isActive && (
													<span
														style={{
															fontSize: "10px",
															padding: "2px 6px",
															borderRadius: "4px",
															background: "rgba(79, 193, 255, 0.2)",
															color: "var(--accent-primary)",
															fontWeight: 600,
														}}
													>
														Active
													</span>
												)}
												{hostsList.length > 1 && (
													<button
														type="button"
														style={{
															background: "transparent",
															border: "none",
															color: "var(--text-muted)",
															cursor: "pointer",
															fontSize: "12px",
															padding: "2px 4px",
														}}
														title="Remove host"
														onClick={(e) => {
															e.stopPropagation();
															removeHost(h.id);
														}}
													>
														✕
													</button>
												)}
											</div>
										</div>
									);
								})}
							</div>
						</div>

						{/* Encrypted Vault Unlocker if detected */}
						{hasEncryptedVault && (
							<div
								style={{
									padding: "10px",
									backgroundColor: "var(--bg-canvas)",
									border: "1px solid var(--border-default)",
									borderRadius: "var(--radius-md)",
									marginBottom: "14px",
								}}
							>
								<div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
									<span style={{ fontSize: "14px" }}>🔐</span>
									<span style={{ fontWeight: 600, fontSize: "12px", color: "var(--text-primary)" }}>
										Encrypted Vault Detected
									</span>
								</div>
								<p style={{ fontSize: "11px", color: "var(--text-muted)", margin: "0 0 6px 0" }}>
									Enter your master passphrase to unlock all saved host credentials.
								</p>
								<div style={{ display: "flex", gap: "6px" }}>
									<input
										type="password"
										className="form-input"
										style={{ flex: 1 }}
										placeholder="Enter master passphrase"
										value={unlockPassphrase}
										onChange={(e) => {
											setUnlockPassphrase(e.target.value);
											if (unlockStatus !== "idle") setUnlockStatus("idle");
										}}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												e.preventDefault();
												handleUnlockVault();
											}
										}}
									/>
									<button
										type="button"
										className="btn btn-secondary"
										onClick={handleUnlockVault}
										disabled={!unlockPassphrase.trim()}
									>
										Unlock & Restore
									</button>
								</div>
								{unlockStatus === "error" && (
									<span style={{ fontSize: "11px", color: "var(--status-error)", marginTop: "4px", display: "block" }}>
										✕ {unlockErrorMessage}
									</span>
								)}
								{unlockStatus === "success" && (
									<span style={{ fontSize: "11px", color: "var(--status-live)", marginTop: "4px", display: "block" }}>
										✓ Vault unlocked! All hosts restored.
									</span>
								)}
							</div>
						)}

						{/* Host Edit Inputs */}
						<div className="form-group">
							<label className="form-label" htmlFor="ahp-host-name">
								Host Display Name
							</label>
							<input
								id="ahp-host-name"
								name="name"
								type="text"
								className="form-input"
								placeholder="e.g. Local pi-agent-host or Tailscale Server"
								value={name}
								onChange={(e) => setName(e.target.value)}
							/>
						</div>

						<div className="form-group">
							<label className="form-label" htmlFor="ahp-host-url">
								WebSocket URL
							</label>
							<input
								id="ahp-host-url"
								name="username"
								type="text"
								autoComplete="username"
								className="form-input"
								placeholder={isHttps ? "wss://127.0.0.1:63877" : "ws://127.0.0.1:63877"}
								value={url}
								onChange={(e) => handleUrlChange(e.target.value)}
								required
							/>
							{isMixedContentTarget && (
								<div
									style={{
										marginTop: "8px",
										padding: "8px 10px",
										borderRadius: "6px",
										background: "rgba(239, 68, 68, 0.1)",
										border: "1px solid rgba(239, 68, 68, 0.3)",
										fontSize: "12px",
										lineHeight: "1.45",
									}}
								>
									<div style={{ color: "#ef4444", fontWeight: 600, marginBottom: "4px" }}>
										⚠️ Mixed Content Warning (HTTPS Origin)
									</div>
									<div style={{ marginBottom: "6px" }}>
										This UI is loaded over HTTPS. Web browsers strictly block unencrypted <code>ws://</code> connections
										from secure pages.
									</div>
									<div
										style={{
											display: "flex",
											gap: "8px",
											alignItems: "center",
											flexWrap: "wrap",
											marginBottom: isTailscaleHost ? "6px" : "0",
										}}
									>
										<button
											type="button"
											className="btn btn-secondary"
											style={{ padding: "3px 8px", fontSize: "11px" }}
											onClick={() => setUrl((prev) => prev.replace(/^ws:\/\//, "wss://"))}
										>
											Switch to wss://
										</button>
										{isTailscaleHost && (
											<button
												type="button"
												className="btn btn-secondary"
												style={{ padding: "3px 8px", fontSize: "11px" }}
												onClick={() => setUrl(`wss://${currentHostname || "node.ts.net"}/ws`)}
											>
												Use CLI Proxy (wss://.../ws)
											</button>
										)}
									</div>
									{isTailscaleHost && (
										<div
											style={{
												fontSize: "11px",
												color: "var(--color-text-secondary, #94a3b8)",
												marginTop: "4px",
											}}
										>
											<strong>Tailscale Tip:</strong> Access this UI via plain HTTP on your Tailscale IP (e.g.{" "}
											<code>http://100.x.y.z:5173</code>) to allow <code>ws://</code> without TLS certificates, or proxy
											via Tailscale Serve (<code>tailscale serve --bg https:8443 / http://127.0.0.1:63877</code>).
										</div>
									)}
								</div>
							)}
							{isNonLocalOrigin && isLoopbackTarget && !isMixedContentTarget && (
								<div
									style={{
										marginTop: "6px",
										padding: "6px 8px",
										borderRadius: "4px",
										background: "rgba(234, 179, 8, 0.1)",
										border: "1px solid rgba(234, 179, 8, 0.3)",
										fontSize: "11px",
										lineHeight: "1.4",
									}}
								>
									<span style={{ color: "#eab308", fontWeight: 600 }}>Notice:</span> <code>127.0.0.1</code> targets this
									device. To connect to workstation, use{" "}
									<button
										type="button"
										className="btn btn-secondary"
										style={{ padding: "1px 4px", fontSize: "10px", margin: "1px 0" }}
										onClick={() => {
											const proto = isHttps ? "wss://" : "ws://";
											setUrl(`${proto}${currentHostname}:63877`);
										}}
									>
										{isHttps ? "wss://" : "ws://"}
										{currentHostname}:63877
									</button>
								</div>
							)}
						</div>

						<div className="form-group">
							<label className="form-label" htmlFor="ahp-host-token">
								Authentication Token (Optional)
							</label>
							<div style={{ display: "flex", gap: "6px" }}>
								<input
									id="ahp-host-token"
									name="password"
									type={showPassword ? "text" : "password"}
									autoComplete="current-password"
									className="form-input"
									placeholder="Paste token or leave empty"
									value={token}
									onChange={(e) => setToken(e.target.value)}
									style={{ flex: 1 }}
								/>
								<button
									type="button"
									className="btn btn-secondary"
									onClick={() => setShowPassword(!showPassword)}
									title={showPassword ? "Hide password" : "Show password"}
									style={{ padding: "0 10px", fontSize: "12px" }}
								>
									{showPassword ? "Hide" : "Show"}
								</button>
							</div>
						</div>

						{/* Security & Storage Mode */}
						<div className="form-group">
							<label className="form-label">Client Encryption & Passphrase Security</label>
							<select
								className="form-input"
								value={mode}
								onChange={(e) => setMode(e.target.value as StoragePrivacyMode)}
							>
								<option value="passphrase">Passphrase Vault (All hosts encrypted under one passphrase)</option>
								<option value="ephemeral">Ephemeral (Zero-Knowledge: keys wiped on tab close)</option>
								<option value="memory-only">Memory-Only (Strict zero disk writes)</option>
							</select>
							<span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginTop: "3px" }}>
								{mode === "passphrase"
									? "All configured AHP hosts and session credentials are encrypted together behind your master passphrase."
									: "Session configs are kept only in temporary browser memory."}
							</span>
						</div>

						{mode === "passphrase" && (
							<div className="form-group">
								<label className="form-label">Master Passphrase</label>
								<input
									type="password"
									className="form-input"
									placeholder="Enter master passphrase for all hosts"
									value={passphrase}
									onChange={(e) => setPassphrase(e.target.value)}
									required
								/>
							</div>
						)}
					</div>

					<div className="modal-footer">
						<button type="button" className="btn btn-secondary" onClick={onClose}>
							Cancel
						</button>
						<button type="submit" className="btn btn-primary">
							Connect & Save Hosts
						</button>
					</div>
				</form>
			</div>
		</div>
	);
};
