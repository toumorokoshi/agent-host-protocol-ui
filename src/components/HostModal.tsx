import type React from "react";
import { useState } from "react";
import type { StoragePrivacyMode } from "../crypto/vault.ts";
import type { HostConfig } from "../types.ts";

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
	const [mode, setMode] = useState<StoragePrivacyMode>("ephemeral");
	const [passphrase, setPassphrase] = useState("");

	if (!isOpen) return null;

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		onSave(
			{
				...currentHost,
				name: name.trim() || "Agent Host",
				url: url.trim(),
				token: token.trim() || undefined,
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

				<form onSubmit={handleSubmit}>
					<div className="modal-body">
						<div className="form-group">
							<label className="form-label">Host Name</label>
							<input
								type="text"
								className="form-input"
								placeholder="e.g. Local pi-agent-host"
								value={name}
								onChange={(e) => setName(e.target.value)}
							/>
						</div>

						<div className="form-group">
							<label className="form-label">WebSocket URL</label>
							<input
								type="text"
								className="form-input"
								placeholder="ws://127.0.0.1:63877"
								value={url}
								onChange={(e) => setUrl(e.target.value)}
								required
							/>
						</div>

						<div className="form-group">
							<label className="form-label">Authentication Token (Optional)</label>
							<input
								type="password"
								className="form-input"
								placeholder="Paste token or leave empty if disabled"
								value={token}
								onChange={(e) => setToken(e.target.value)}
							/>
							<span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
								Tokens are encrypted in your browser vault using AES-GCM-256 and never logged.
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
