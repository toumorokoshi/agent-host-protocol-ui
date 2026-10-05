import type React from "react";
import { useState } from "react";
import type { UiSession } from "../types.ts";
import { formatDirectoryBase, formatDirectoryTooltip } from "../utils/format-session-dir.ts";
import { Tooltip } from "./Tooltip.tsx";

interface SidebarProps {
	sessions: UiSession[];
	activeSessionId: string | null;
	isOpen?: boolean;
	onClose?: () => void;
	onSelectSession: (id: string) => void;
	onDisposeSession: (id: string) => void;
	onRenameSession: (id: string, newTitle: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
	sessions,
	activeSessionId,
	isOpen = false,
	onClose,
	onSelectSession,
	onDisposeSession,
	onRenameSession,
}) => {
	const [search, setSearch] = useState("");

	const filteredSessions = sessions.filter(
		(s) =>
			s.title.toLowerCase().includes(search.toLowerCase()) ||
			s.workingDirectory.toLowerCase().includes(search.toLowerCase()),
	);

	const liveSessions = filteredSessions.filter((s) => s.isLive && !s.isArchived);
	const pastSessions = filteredSessions.filter((s) => !s.isLive && !s.isArchived);

	const handleSessionSelect = (id: string) => {
		onSelectSession(id);
		onClose?.();
	};

	return (
		<>
			{isOpen && <div className="sidebar-backdrop" onClick={onClose} />}
			<aside className={`sidebar ${isOpen ? "open" : ""}`}>
				<div className="sidebar-mobile-header">
					<span className="sidebar-mobile-title">Sessions</span>
					<button type="button" className="sidebar-close-btn" onClick={onClose} aria-label="Close sessions sidebar">
						✕
					</button>
				</div>

				<div className="sidebar-search">
					<input
						type="text"
						className="search-input"
						placeholder="Filter sessions..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
				</div>

				<div className="sessions-container">
					{/* Live Sessions */}
					{liveSessions.length > 0 && (
						<div>
							<div className="section-label">
								<span>Live Sessions</span>
								<span>{liveSessions.length}</span>
							</div>
							{liveSessions.map((session) => (
								<div
									key={session.id}
									className={`session-item ${session.id === activeSessionId ? "active" : ""}`}
									onClick={() => handleSessionSelect(session.id)}
								>
									<div className="session-header">
										<span className="session-title" title={session.title}>
											{session.title}
										</span>
										<span className="live-badge">Live</span>
									</div>
									<div className="session-meta">
										{session.hostName && (
											<>
												<span className="session-host-tag" title={`Host: ${session.hostName}`}>
													{session.hostName}
												</span>
												<span>•</span>
											</>
										)}
										<Tooltip content={formatDirectoryTooltip(session.workingDirectory)}>
											<span className="session-dir">📁 {formatDirectoryBase(session.workingDirectory)}</span>
										</Tooltip>
										<span>•</span>
										<span>{session.model.split("/").pop()}</span>
									</div>
								</div>
							))}
						</div>
					)}

					{/* Past Sessions */}
					<div>
						<div className="section-label" style={{ marginTop: liveSessions.length ? "12px" : "0" }}>
							<span>Recent Sessions</span>
							<span>{pastSessions.length}</span>
						</div>
						{pastSessions.map((session) => (
							<div
								key={session.id}
								className={`session-item ${session.id === activeSessionId ? "active" : ""}`}
								onClick={() => handleSessionSelect(session.id)}
							>
								<div className="session-header">
									<span className="session-title" title={session.title}>
										{session.title}
									</span>
									<div style={{ display: "flex", gap: "4px" }}>
										<button
											type="button"
											style={{
												background: "transparent",
												border: "none",
												color: "var(--text-muted)",
												cursor: "pointer",
												fontSize: "11px",
											}}
											title="Rename session"
											onClick={(e) => {
												e.stopPropagation();
												const newTitle = prompt("New session title:", session.title);
												if (newTitle?.trim()) onRenameSession(session.id, newTitle.trim());
											}}
										>
											✎
										</button>
										<button
											type="button"
											style={{
												background: "transparent",
												border: "none",
												color: "var(--text-muted)",
												cursor: "pointer",
											}}
											title="Dispose session"
											onClick={(e) => {
												e.stopPropagation();
												if (confirm("Dispose this session?")) onDisposeSession(session.id);
											}}
										>
											✕
										</button>
									</div>
								</div>
								<div className="session-meta">
									{session.hostName && (
										<>
											<span className="session-host-tag" title={`Host: ${session.hostName}`}>
												{session.hostName}
											</span>
											<span>•</span>
										</>
									)}
									<Tooltip content={formatDirectoryTooltip(session.workingDirectory)}>
										<span className="session-dir">📁 {formatDirectoryBase(session.workingDirectory)}</span>
									</Tooltip>
									<span>•</span>
									<span>
										{new Date(session.modifiedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
									</span>
								</div>
							</div>
						))}

						{filteredSessions.length === 0 && (
							<div style={{ padding: "24px 16px", color: "var(--text-muted)", textAlign: "center", fontSize: "13px" }}>
								No sessions found
							</div>
						)}
					</div>
				</div>
			</aside>
		</>
	);
};
