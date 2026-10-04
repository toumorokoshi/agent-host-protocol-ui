import DOMPurify from "dompurify";
import { marked } from "marked";
import type React from "react";
import { useState } from "react";
import type { UiTurn } from "../types.ts";

interface ChatTimelineProps {
	turns: UiTurn[];
	activeTurn?: UiTurn;
	onConfirmToolCall?: (toolCallId: string, approved: boolean) => void;
	onResumeTurn?: () => void;
}

export const ChatTimeline: React.FC<ChatTimelineProps> = ({ turns, activeTurn, onConfirmToolCall, onResumeTurn }) => {
	const [openThinking, setOpenThinking] = useState<Record<string, boolean>>({});

	const toggleThinking = (turnId: string) => {
		setOpenThinking((prev) => ({ ...prev, [turnId]: !prev[turnId] }));
	};

	const renderMarkdown = (text: string) => {
		const rawHtml = marked.parse(text) as string;
		const sanitized = DOMPurify.sanitize(rawHtml);
		return { __html: sanitized };
	};

	const allTurns = activeTurn ? [...turns, activeTurn] : turns;

	return (
		<div className="chat-timeline">
			{allTurns.length === 0 && (
				<div style={{ margin: "auto", textAlign: "center", color: "var(--text-muted)" }}>
					<h3 style={{ color: "var(--text-primary)", marginBottom: "8px" }}>Ready to Assist</h3>
					<p style={{ fontSize: "13px", maxWidth: "400px" }}>
						Type your prompt below or start with <code>/</code> to invoke skills and prompt templates.
					</p>
				</div>
			)}

			{allTurns.map((turn) => {
				const isStreaming = turn.state === "streaming";
				const isThinkingOpen = openThinking[turn.id] ?? isStreaming;

				return (
					<div key={turn.id} className="turn-group">
						{/* User Message */}
						<div className="user-message">
							<div>{turn.userPrompt}</div>
							{turn.model && (
								<div style={{ marginTop: "6px", fontSize: "11px", color: "var(--text-muted)" }}>{turn.model}</div>
							)}
						</div>

						{/* Assistant Response */}
						<div className="assistant-message">
							{/* Thinking Stream */}
							{turn.thinkingContent && (
								<div className="thinking-accordion">
									<div className="thinking-summary" onClick={() => toggleThinking(turn.id)}>
										<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
											<span className="status-dot" style={{ backgroundColor: "#a855f7" }} />
											<span>
												Thinking Process{" "}
												{turn.thinkingDurationMs ? `(${Math.round(turn.thinkingDurationMs / 100) / 10}s)` : ""}
											</span>
										</div>
										<span>{isThinkingOpen ? "▲ Hide" : "▼ View chain-of-thought"}</span>
									</div>
									{isThinkingOpen && <div className="thinking-content">{turn.thinkingContent}</div>}
								</div>
							)}

							{/* Tool Calls */}
							{turn.toolCalls.map((tool) => (
								<div key={tool.id} className="tool-call-card">
									<div className="tool-call-header">
										<div className="tool-name-badge">
											<span>⚡</span>
											<span>{tool.name}</span>
										</div>
										<span className={`tool-status-pill ${tool.status}`}>{tool.status}</span>
									</div>

									<div className="tool-call-body">
										<div style={{ color: "var(--text-muted)", marginBottom: "4px" }}>// Arguments</div>
										<div>
											{typeof tool.arguments === "string" ? tool.arguments : JSON.stringify(tool.arguments, null, 2)}
										</div>

										{tool.result && (
											<div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid var(--border-subtle)" }}>
												<div style={{ color: "var(--text-muted)", marginBottom: "4px" }}>// Result</div>
												<div style={{ color: "var(--text-primary)" }}>{tool.result}</div>
											</div>
										)}
									</div>

									{tool.status === "pending-confirmation" && onConfirmToolCall && (
										<div className="tool-confirm-bar">
											<span style={{ fontSize: "12px", color: "#fca5a5" }}>
												This tool requires explicit approval to execute.
											</span>
											<div style={{ display: "flex", gap: "8px" }}>
												<button
													type="button"
													className="btn btn-secondary"
													style={{ padding: "3px 8px", fontSize: "11px" }}
													onClick={() => onConfirmToolCall(tool.id, false)}
												>
													Deny
												</button>
												<button
													type="button"
													className="btn btn-primary"
													style={{ padding: "3px 8px", fontSize: "11px" }}
													onClick={() => onConfirmToolCall(tool.id, true)}
												>
													Approve
												</button>
											</div>
										</div>
									)}
								</div>
							))}

							{/* Markdown Assistant Text */}
							{turn.assistantText && (
								<div className="markdown-body" dangerouslySetInnerHTML={renderMarkdown(turn.assistantText)} />
							)}

							{/* Resumable Error Banner */}
							{turn.resumableError && (
								<div className="error-banner">
									<div className="error-banner-text">⚠️ Turn paused: {turn.resumableError}</div>
									{onResumeTurn && (
										<button type="button" className="btn btn-secondary" onClick={onResumeTurn}>
											Resume Turn
										</button>
									)}
								</div>
							)}

							{/* Turn Metrics */}
							{turn.tokens && (
								<div style={{ fontSize: "11px", color: "var(--text-muted)", display: "flex", gap: "12px" }}>
									<span>Prompt: {turn.tokens.prompt} tokens</span>
									<span>Completion: {turn.tokens.completion} tokens</span>
									{turn.durationMs && <span>Duration: {Math.round(turn.durationMs / 100) / 10}s</span>}
								</div>
							)}
						</div>
					</div>
				);
			})}
		</div>
	);
};
