import type React from "react";
import { useState } from "react";
import type { SkillItem, UiSession } from "../types.ts";
import { Tooltip } from "./Tooltip.tsx";

interface InspectorProps {
	session: UiSession | null;
	onRemoveQueuedMessage: (index: number) => void;
	isOpen: boolean;
	onToggle: () => void;
}

export const Inspector: React.FC<InspectorProps> = ({ session, onRemoveQueuedMessage, isOpen, onToggle }) => {
	const [activeTab, setActiveTab] = useState<"skills" | "queue" | "diagnostics">("skills");

	if (!isOpen) return null;

	return (
		<>
			<div className="inspector-backdrop" onClick={onToggle} />
			<aside className="inspector-panel open">
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						padding: "10px 16px",
						borderBottom: "1px solid var(--border-subtle)",
					}}
				>
					<span style={{ fontWeight: 600, fontSize: "13px" }}>Inspector</span>
					<button
						type="button"
						className="inspector-close-btn"
						style={{
							background: "transparent",
							border: "none",
							color: "var(--text-muted)",
							cursor: "pointer",
							fontSize: "14px",
							padding: "4px 8px",
						}}
						onClick={onToggle}
						aria-label="Close inspector"
					>
						✕
					</button>
				</div>

				<div className="inspector-tabs">
					<div
						className={`inspector-tab ${activeTab === "skills" ? "active" : ""}`}
						onClick={() => setActiveTab("skills")}
					>
						Skills ({session?.skills.length || 0})
					</div>
					<div
						className={`inspector-tab ${activeTab === "queue" ? "active" : ""}`}
						onClick={() => setActiveTab("queue")}
					>
						Queue ({session?.queuedMessages.length || 0})
					</div>
					<div
						className={`inspector-tab ${activeTab === "diagnostics" ? "active" : ""}`}
						onClick={() => setActiveTab("diagnostics")}
					>
						Info
					</div>
				</div>

				<div className="inspector-content">
					{activeTab === "skills" && (
						<>
							<div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px" }}>
								Skills advertised by agent host for this session:
							</div>
							{session?.skills.map((skill: SkillItem) => (
								<div key={skill.id} className="skill-card">
									<div className="skill-header">
										<span className="skill-name">{skill.name}</span>
										<span style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase" }}>
											{skill.type}
										</span>
									</div>
									<div className="skill-desc">{skill.description}</div>
								</div>
							))}
						</>
					)}

					{activeTab === "queue" && (
						<>
							<div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px" }}>
								Messages queued to execute after active turn finishes:
							</div>
							{session?.queuedMessages.length === 0 && (
								<div style={{ color: "var(--text-muted)", fontSize: "12px", textAlign: "center", padding: "24px 0" }}>
									Queue is empty
								</div>
							)}
							{session?.queuedMessages.map((msg: string, idx: number) => (
								<div
									key={idx}
									className="skill-card"
									style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
								>
									<span style={{ fontSize: "13px", color: "var(--text-primary)" }}>{msg}</span>
									<button
										type="button"
										style={{
											background: "transparent",
											border: "none",
											color: "var(--color-danger)",
											cursor: "pointer",
										}}
										onClick={() => onRemoveQueuedMessage(idx)}
										title="Remove from queue"
									>
										✕
									</button>
								</div>
							))}
						</>
					)}

					{activeTab === "diagnostics" && (
						<div style={{ fontSize: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
							<div>
								<strong style={{ color: "var(--text-primary)" }}>Session ID:</strong>
								<div style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{session?.id}</div>
							</div>
							<div>
								<strong style={{ color: "var(--text-primary)" }}>Working Directory:</strong>
								<div style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)", wordBreak: "break-all" }}>
									<Tooltip content={session?.workingDirectory}>
										<span style={{ cursor: "pointer" }}>{session?.workingDirectory}</span>
									</Tooltip>
								</div>
							</div>
							<div>
								<strong style={{ color: "var(--text-primary)" }}>Client Encryption:</strong>
								<div style={{ color: "var(--color-success)" }}>Web Crypto AES-GCM-256 (Active)</div>
							</div>
							<div>
								<strong style={{ color: "var(--text-primary)" }}>Protocol Versions:</strong>
								<div style={{ color: "var(--text-secondary)" }}>0.9.x, 1.0.0</div>
							</div>
						</div>
					)}
				</div>
			</aside>
		</>
	);
};
