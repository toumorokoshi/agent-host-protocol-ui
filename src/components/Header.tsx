import type React from "react";
import type { ConnectionStatus, HostConfig } from "../types.ts";

interface HeaderProps {
	currentHost: HostConfig;
	status: ConnectionStatus;
	isMockMode: boolean;
	onOpenHostModal: () => void;
	onNewSession: () => void;
	onToggleMockMode: () => void;
}

export const Header: React.FC<HeaderProps> = ({
	currentHost,
	status,
	isMockMode,
	onOpenHostModal,
	onNewSession,
	onToggleMockMode,
}) => {
	return (
		<header className="header">
			<div className="header-left">
				<div className="brand-badge">
					<div className="brand-icon">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
							<path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.38-1 1.72V7h2a7 7 0 0 1 7 7v1a1 1 0 0 1-1 1h-1v1a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-1H3a1 1 0 0 1-1-1v-1a7 7 0 0 1 7-7h2V5.72A2 2 0 0 1 10 4a2 2 0 0 1 2-2m-3 9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3m6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3" />
						</svg>
					</div>
					<span>Agent Host Protocol</span>
				</div>

				<button type="button" className="host-pill" onClick={onOpenHostModal} title="Configure Agent Host Connection">
					<span className={`status-dot ${isMockMode ? "connected" : status}`} />
					<span>{isMockMode ? "Demo Host (Simulation)" : currentHost.name}</span>
					<span style={{ color: "var(--text-muted)", fontSize: "11px" }}>
						{isMockMode ? "In-Memory" : currentHost.url.replace(/\?tkn=.*$/, "")}
					</span>
				</button>

				<div className="privacy-badge" title="Web Crypto AES-GCM-256 Client-Side Encryption Enabled">
					<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
						<path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 6c1.4 0 2.5 1.1 2.5 2.5V11c.6 0 1 .4 1 1v4c0 .6-.4 1-1 1h-5c-.6 0-1-.4-1-1v-4c0-.6.4-1 1-1V9.5C9.5 8.1 10.6 7 12 7zm0 1.5c-.6 0-1 .4-1 1V11h2V9.5c0-.6-.4-1-1-1z" />
					</svg>
					<span>Private & Encrypted</span>
				</div>
			</div>

			<div className="header-right">
				<button
					type="button"
					className="btn btn-secondary"
					onClick={onToggleMockMode}
					title="Toggle between Live WebSocket and Demo Mode"
				>
					{isMockMode ? "Switch to Live Host" : "Switch to Demo Mode"}
				</button>

				<button type="button" className="btn btn-primary" onClick={onNewSession}>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
						<line x1="12" y1="5" x2="12" y2="19" />
						<line x1="5" y1="12" x2="19" y2="12" />
					</svg>
					<span>New Session</span>
				</button>
			</div>
		</header>
	);
};
