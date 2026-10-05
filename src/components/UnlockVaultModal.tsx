import type React from "react";
import { useState } from "react";

interface UnlockVaultModalProps {
	isOpen: boolean;
	onUnlock: (passphrase: string) => Promise<{ success: boolean; error?: string }>;
	onSkip: () => void;
	onReset: () => void;
}

export const UnlockVaultModal: React.FC<UnlockVaultModalProps> = ({ isOpen, onUnlock, onSkip, onReset }) => {
	const [passphrase, setPassphrase] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [errorMessage, setErrorMessage] = useState("");

	if (!isOpen) return null;

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!passphrase.trim() || isSubmitting) return;

		setIsSubmitting(true);
		setErrorMessage("");

		try {
			const result = await onUnlock(passphrase.trim());
			if (!result.success) {
				setErrorMessage(result.error || "Incorrect passphrase. Please try again.");
			}
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : "Failed to unlock vault";
			setErrorMessage(msg);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="modal-backdrop" onClick={onSkip}>
			<div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "440px", width: "90%" }}>
				<div className="modal-header">
					<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
						<span style={{ fontSize: "18px" }}>🔐</span>
						<h3 className="modal-title">Unlock Configuration</h3>
					</div>
					<button
						type="button"
						style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
						onClick={onSkip}
						aria-label="Skip unlock"
					>
						✕
					</button>
				</div>

				<form onSubmit={handleSubmit}>
					<div className="modal-body">
						<p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: "0 0 16px 0", lineHeight: "1.5" }}>
							Your AHP host settings, connection credentials, and preferences are encrypted with a master passphrase.
							Enter your passphrase to restore your workspace.
						</p>

						<div className="form-group">
							<label className="form-label" htmlFor="vault-master-passphrase">
								Master Passphrase
							</label>
							<input
								id="vault-master-passphrase"
								type="password"
								className="form-input"
								placeholder="Enter your master passphrase"
								value={passphrase}
								onChange={(e) => {
									setPassphrase(e.target.value);
									if (errorMessage) setErrorMessage("");
								}}
								disabled={isSubmitting}
								required
							/>
						</div>

						{errorMessage && (
							<div
								style={{
									marginTop: "12px",
									padding: "8px 12px",
									backgroundColor: "rgba(248, 81, 73, 0.1)",
									border: "1px solid var(--status-error)",
									borderRadius: "var(--radius-sm)",
									fontSize: "12px",
									color: "var(--status-error)",
								}}
							>
								✕ {errorMessage}
							</div>
						)}
					</div>

					<div
						className="modal-footer"
						style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
					>
						<button
							type="button"
							className="btn btn-secondary"
							onClick={onReset}
							style={{ fontSize: "11px", color: "var(--text-muted)" }}
							title="Delete encrypted credentials stored on this device"
						>
							Reset Stored Data
						</button>

						<div style={{ display: "flex", gap: "8px" }}>
							<button type="button" className="btn btn-secondary" onClick={onSkip} disabled={isSubmitting}>
								Skip for Now
							</button>
							<button type="submit" className="btn btn-primary" disabled={!passphrase.trim() || isSubmitting}>
								{isSubmitting ? "Unlocking..." : "Unlock & Connect"}
							</button>
						</div>
					</div>
				</form>
			</div>
		</div>
	);
};
