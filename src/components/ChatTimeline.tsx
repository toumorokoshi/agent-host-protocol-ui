import DOMPurify from "dompurify";
import { marked } from "marked";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { UiTurn } from "../types.ts";
import { ToolCallItem } from "./ToolCallItem.tsx";

interface ChatTimelineProps {
	turns: UiTurn[];
	activeTurn?: UiTurn;
	onConfirmToolCall?: (toolCallId: string, approved: boolean) => void;
	onResumeTurn?: () => void;
}

export const ChatTimeline: React.FC<ChatTimelineProps> = ({ turns, activeTurn, onConfirmToolCall, onResumeTurn }) => {
	const [openThinking, setOpenThinking] = useState<Record<string, boolean>>({});
	const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);
	const timelineRef = useRef<HTMLDivElement>(null);
	const isUserScrolledUpRef = useRef(false);

	const toggleThinking = (turnId: string) => {
		setOpenThinking((prev) => ({ ...prev, [turnId]: !prev[turnId] }));
	};

	const renderMarkdown = (text: string) => {
		const rawHtml = marked.parse(text) as string;
		const sanitized = DOMPurify.sanitize(rawHtml);
		return { __html: sanitized };
	};

	const allTurns = activeTurn ? [...turns, activeTurn] : turns;

	const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
		const el = timelineRef.current;
		if (!el) return;
		el.scrollTo({ top: el.scrollHeight, behavior });
		isUserScrolledUpRef.current = false;
		setShowScrollBottomBtn(false);
	}, []);

	const handleScroll = useCallback(() => {
		const el = timelineRef.current;
		if (!el) return;
		const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
		const isScrolledUp = distanceFromBottom > 60;
		isUserScrolledUpRef.current = isScrolledUp;
		setShowScrollBottomBtn(isScrolledUp);
	}, []);

	// Initial mount / session load: jump to bottom
	useEffect(() => {
		const el = timelineRef.current;
		if (el) {
			el.scrollTop = el.scrollHeight;
		}
	}, []);

	// Stream updates / new turns: auto-scroll to bottom unless user explicitly scrolled up
	useEffect(() => {
		// Track updates from turns and activeTurn stream
		if (turns || activeTurn) {
			if (!isUserScrolledUpRef.current) {
				const el = timelineRef.current;
				if (el) {
					el.scrollTop = el.scrollHeight;
				}
			}
		}
	}, [turns, activeTurn]);

	// Visual viewport resize listener for mobile virtual keyboard open/close
	useEffect(() => {
		if (typeof window === "undefined" || !window.visualViewport) return;
		const handleViewportResize = () => {
			if (!isUserScrolledUpRef.current && timelineRef.current) {
				timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
			}
		};
		window.visualViewport.addEventListener("resize", handleViewportResize);
		return () => window.visualViewport?.removeEventListener("resize", handleViewportResize);
	}, []);

	return (
		<div className="chat-timeline" ref={timelineRef} onScroll={handleScroll}>
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
											<span className="status-dot" style={{ backgroundColor: "var(--color-purple)" }} />
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
							{turn.toolCalls.length > 0 && (
								<div className="tool-calls-container">
									{turn.toolCalls.map((tool) => (
										<ToolCallItem key={tool.id} tool={tool} onConfirmToolCall={onConfirmToolCall} />
									))}
								</div>
							)}

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

			{showScrollBottomBtn && (
				<button
					type="button"
					className="scroll-to-bottom-btn"
					onClick={() => scrollToBottom("smooth")}
					title="Scroll to latest messages"
					aria-label="Scroll to bottom"
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
						<polyline points="6 9 12 15 18 9" />
					</svg>
					<span>Scroll to bottom</span>
				</button>
			)}
		</div>
	);
};
