import type React from "react";
import type { ResolvedTheme, ThemePreference } from "../hooks/useTheme.ts";
import type { ConnectionStatus } from "../types.ts";

interface HeaderProps {
	status: ConnectionStatus;
	isMockMode: boolean;
	themePreference: ThemePreference;
	resolvedTheme: ResolvedTheme;
	activeHostName?: string;
	onSetTheme: (theme: ThemePreference) => void;
	onOpenHostModal: () => void;
	onNewSession: () => void;
	onToggleMockMode: () => void;
	onToggleSidebar?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
	status,
	isMockMode,
	themePreference,
	resolvedTheme,
	activeHostName,
	onSetTheme,
	onOpenHostModal,
	onNewSession,
	onToggleMockMode,
	onToggleSidebar,
}) => {
	return (
		<header className="header">
			<div className="header-left">
				{onToggleSidebar && (
					<button
						type="button"
						className="mobile-sidebar-toggle"
						onClick={onToggleSidebar}
						title="Toggle Sessions Sidebar"
						aria-label="Toggle sessions sidebar"
					>
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
							<line x1="3" y1="12" x2="21" y2="12" />
							<line x1="3" y1="6" x2="21" y2="6" />
							<line x1="3" y1="18" x2="21" y2="18" />
						</svg>
					</button>
				)}

				<div className="brand-badge">
					<div className="brand-icon">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
							<path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.38-1 1.72V7h2a7 7 0 0 1 7 7v1a1 1 0 0 1-1 1h-1v1a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-1H3a1 1 0 0 1-1-1v-1a7 7 0 0 1 7-7h2V5.72A2 2 0 0 1 10 4a2 2 0 0 1 2-2m-3 9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3m6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3" />
						</svg>
					</div>
					<span className="brand-text-full">Agent Host Protocol</span>
					<span className="brand-text-short">AHP</span>
				</div>

				<div className="privacy-badge" title="Web Crypto AES-GCM-256 Client-Side Encryption Enabled">
					<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
						<path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 6c1.4 0 2.5 1.1 2.5 2.5V11c.6 0 1 .4 1 1v4c0 .6-.4 1-1 1h-5c-.6 0-1-.4-1-1v-4c0-.6.4-1 1-1V9.5C9.5 8.1 10.6 7 12 7zm0 1.5c-.6 0-1 .4-1 1V11h2V9.5c0-.6-.4-1-1-1z" />
					</svg>
					<span className="privacy-badge-text">Private & Encrypted</span>
				</div>
			</div>

			<div className="header-right">
				<div
					className="theme-toggle-group"
					title={`Theme: ${themePreference === "system" ? `Auto (${resolvedTheme})` : themePreference}. Defaults to dark mode, or uses system preference when provided.`}
				>
					<button
						type="button"
						className={`theme-toggle-btn ${themePreference === "system" ? "active" : ""}`}
						onClick={() => onSetTheme("system")}
						title={`Auto: follows system mode (${resolvedTheme}), dark by default`}
					>
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
							<line x1="8" y1="21" x2="16" y2="21" />
							<line x1="12" y1="17" x2="12" y2="21" />
						</svg>
						<span>Auto{themePreference === "system" ? ` (${resolvedTheme})` : ""}</span>
					</button>
					<button
						type="button"
						className={`theme-toggle-btn ${themePreference === "light" ? "active" : ""}`}
						onClick={() => onSetTheme("light")}
						title="Force Light Mode"
					>
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<circle cx="12" cy="12" r="5" />
							<line x1="12" y1="1" x2="12" y2="3" />
							<line x1="12" y1="21" x2="12" y2="23" />
							<line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
							<line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
							<line x1="1" y1="12" x2="3" y2="12" />
							<line x1="21" y1="12" x2="23" y2="12" />
							<line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
							<line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
						</svg>
					</button>
					<button
						type="button"
						className={`theme-toggle-btn ${themePreference === "dark" ? "active" : ""}`}
						onClick={() => onSetTheme("dark")}
						title="Force Dark Mode"
					>
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
						</svg>
					</button>
				</div>

				<button
					type="button"
					className="btn btn-secondary header-mode-btn"
					onClick={onToggleMockMode}
					title={isMockMode ? "Switch to Live Host" : "Switch to Demo Mode"}
				>
					<span className="btn-text-full">{isMockMode ? "Switch to Live Host" : "Switch to Demo Mode"}</span>
					<span className="btn-text-short">{isMockMode ? "⚡ Live" : "🎮 Demo"}</span>
				</button>

				<button
					type="button"
					className="btn btn-primary header-new-session-btn"
					onClick={onNewSession}
					title="New Session"
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
						<line x1="12" y1="5" x2="12" y2="19" />
						<line x1="5" y1="12" x2="19" y2="12" />
					</svg>
					<span className="btn-text-full">New Session</span>
					<span className="btn-text-short">New</span>
				</button>

				<button
					type="button"
					className="header-settings-btn"
					onClick={onOpenHostModal}
					title={`Settings: Configure Agent Hosts (Current: ${isMockMode ? "Demo Mode" : activeHostName || "AHP"})`}
					aria-label="Settings: configure agent host connection"
				>
					<svg
						width="15"
						height="15"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<circle cx="12" cy="12" r="3" />
						<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
					</svg>
					{!isMockMode && activeHostName && (
						<span
							style={{
								fontSize: "11px",
								fontWeight: 500,
								color: "var(--text-secondary)",
								maxWidth: "100px",
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
							}}
						>
							{activeHostName}
						</span>
					)}
					<span className={`status-dot settings-status-dot ${isMockMode ? "connected" : status}`} />
				</button>
			</div>
		</header>
	);
};
