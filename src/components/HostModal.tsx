import type React from "react";
import { useEffect, useState } from "react";
import { hasStoredVault, unlockAppConfiguration } from "../crypto/app-config.ts";
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
	isOpen: boolean;
	onClose: () => void;
	onSave: (host: HostConfig, mode: StoragePrivacyMode, passphrase?: string) => void;
}

export const HostModal: React.FC<HostModalProps> = ({ currentHost, isOpen, onClose, onSave }) => {
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

	// Proactively check browser password manager (Credential Management API) if fields are empty
	useEffect(() => {
		if (!isOpen) return;
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
	}, [isOpen, currentHost]);

	const handleUnlockVault = async () => {
		if (!unlockPassphrase.trim()) return;
		try {
			const config = await unlockAppConfiguration(unlockPassphrase.trim());
			if (config?.currentHost?.url) {
				setUrl(config.currentHost.url);
				setToken(config.currentHost.token || "");
				if (config.currentHost.name) setName(config.currentHost.name);
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

	const currentHostname = typeof window !== "undefined" ? window.location.hostname : "";
	const isNonLocalOrigin =
		Boolean(currentHostname) &&
		currentHostname !== "localhost" &&
		currentHostname !== "127.0.0.1" &&
		currentHostname !== "::1";
	const isLoopbackTarget = url.includes("127.0.0.1") || url.includes("localhost");

	if (!isOpen) return null;

	const handleUrlChange = (val: string) => {
		// Smart URL Decomposition: if user pastes full URL with ?tkn= or ?token=
		try {
			if (val.includes("?tkn=") || val.includes("?token=") || val.includes("&tkn=")) {
				const isSecure = val.startsWith("wss://");
				const tempUrl = val.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
				const parsed = new URL(tempUrl);
				const tkn = parsed.searchParams.get("tkn") || parsed.searchParams.get("token");
				if (tkn) {
					parsed.searchParams.delete("tkn");
					parsed.searchParams.delete("token");
					const cleanProto = isSecure ? "wss://" : "ws://";
					const cleanHost = parsed.host;
					const cleanPath = parsed.pathname === "/" && !val.includes(`${cleanHost}/`) ? "" : parsed.pathname;
					const cleanUrl = `${cleanProto}${cleanHost}${cleanPath}`;
					setUrl(cleanUrl);
					setToken(tkn);
					return;
				}
			}
		} catch {
			// Fall through to regular URL update
		}
		setUrl(val);
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();

		const cleanUrl = url.trim();
		const cleanToken = token.trim();
		const cleanName = name.trim() || "Agent Host";

		// Save credentials into browser's native password manager (Chrome, Keychain, Edge, etc.)
		if (typeof window !== "undefined" && window.PasswordCredential && navigator.credentials && cleanToken) {
			try {
				const cred = new window.PasswordCredential({
					id: cleanUrl,
					password: cleanToken,
					name: cleanName,
				});
				navigator.credentials.store(cred).catch(() => {});
			} catch {
				// Ignore if browser restricts PasswordCredential
			}
		}

		onSave(
			{
				...currentHost,
				name: cleanName,
				url: cleanUrl,
				token: cleanToken || undefined,
			},
			mode,
			passphrase,
		);
		onClose();
	};

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal-card" onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">
					<h3 className="modal-title">Configure Agent Host</h3>
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
						{hasEncryptedVault && (
							<div
								style={{
									padding: "12px",
									backgroundColor: "var(--bg-canvas)",
									border: "1px solid var(--border-default)",
									borderRadius: "var(--radius-md)",
									marginBottom: "16px",
								}}
							>
								<div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
									<span style={{ fontSize: "14px" }}>🔐</span>
									<span style={{ fontWeight: 600, fontSize: "12px", color: "var(--text-primary)" }}>
										Encrypted Vault Detected
									</span>
								</div>
								<p style={{ fontSize: "11px", color: "var(--text-muted)", margin: "0 0 8px 0" }}>
									Enter your master passphrase to unlock and restore previously saved host credentials.
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
									<span style={{ fontSize: "11px", color: "var(--status-error)", marginTop: "6px", display: "block" }}>
										✕ {unlockErrorMessage}
									</span>
								)}
								{unlockStatus === "success" && (
									<span style={{ fontSize: "11px", color: "var(--status-live)", marginTop: "6px", display: "block" }}>
										✓ Vault unlocked! Host credentials restored.
									</span>
								)}
							</div>
						)}

						<div className="form-group">
							<label className="form-label" htmlFor="ahp-host-name">
								Host Name
							</label>
							<input
								id="ahp-host-name"
								name="name"
								type="text"
								className="form-input"
								placeholder="e.g. Local pi-agent-host"
								value={name}
								onChange={(e) => setName(e.target.value)}
							/>
						</div>

						<div className="form-group">
							<label className="form-label" htmlFor="ahp-host-url">
								WebSocket URL (Username / Host Identity)
							</label>
							<input
								id="ahp-host-url"
								name="username"
								type="text"
								autoComplete="username"
								className="form-input"
								placeholder="ws://127.0.0.1:63877"
								value={url}
								onChange={(e) => handleUrlChange(e.target.value)}
								required
							/>
							<span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
								Paste full URL or connection string. Chrome and password managers save this as the account username.
							</span>
							{isNonLocalOrigin && isLoopbackTarget && (
								<div
									style={{
										marginTop: "8px",
										padding: "8px 10px",
										borderRadius: "6px",
										background: "rgba(234, 179, 8, 0.1)",
										border: "1px solid rgba(234, 179, 8, 0.3)",
										fontSize: "12px",
										lineHeight: "1.4",
									}}
								>
									<span style={{ color: "#eab308", fontWeight: 600 }}>Network Notice:</span> Targeting{" "}
									<code>127.0.0.1</code> connects to this device itself. To connect to your workstation host, use{" "}
									<button
										type="button"
										className="btn btn-secondary"
										style={{ padding: "1px 6px", fontSize: "11px", margin: "2px 0 2px 4px" }}
										onClick={() => {
											const proto = window.location.protocol === "https:" ? "wss://" : "ws://";
											setUrl(`${proto}${currentHostname}:63877`);
										}}
									>
										ws://{currentHostname}:63877
									</button>
									<div style={{ marginTop: "4px", fontSize: "11px", color: "var(--text-muted)" }}>
										Ensure your AHP host was started with <code>--host 0.0.0.0</code>.
									</div>
								</div>
							)}
						</div>

						<div className="form-group">
							<label className="form-label" htmlFor="ahp-host-token">
								Authentication Token (Password / Secret)
							</label>
							<div style={{ display: "flex", gap: "6px" }}>
								<input
									id="ahp-host-token"
									name="password"
									type={showPassword ? "text" : "password"}
									autoComplete="current-password"
									className="form-input"
									placeholder="Paste token or leave empty if disabled"
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
							<span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
								Saved securely in your browser's hardware keychain (Chrome, Touch ID, Keychain) and client Web Crypto
								vault.
							</span>
						</div>

						<div className="form-group">
							<label className="form-label">Client Encryption & Storage Mode</label>
							<select
								className="form-input"
								value={mode}
								onChange={(e) => setMode(e.target.value as StoragePrivacyMode)}
							>
								<option value="ephemeral">Ephemeral (Zero-Knowledge: keys wiped on tab close)</option>
								<option value="passphrase">Passphrase Vault (PBKDF2 encrypted persistence)</option>
								<option value="memory-only">Memory-Only (Strict zero disk writes)</option>
							</select>
						</div>

						{mode === "passphrase" && (
							<div className="form-group">
								<label className="form-label">Master Passphrase</label>
								<input
									type="password"
									className="form-input"
									placeholder="Enter vault passphrase"
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
							Connect & Save
						</button>
					</div>
				</form>
			</div>
		</div>
	);
};
