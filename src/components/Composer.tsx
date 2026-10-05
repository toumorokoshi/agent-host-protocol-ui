import type React from "react";
import { useEffect, useRef, useState } from "react";
import type { SkillItem } from "../types.ts";

interface ComposerProps {
	isStreaming: boolean;
	skills: SkillItem[];
	queuedCount: number;
	onSendMessage: (text: string, isSteering: boolean) => void;
	onCancelTurn: () => void;
	onOpenQueueModal: () => void;
}

export const Composer: React.FC<ComposerProps> = ({
	isStreaming,
	skills,
	queuedCount,
	onSendMessage,
	onCancelTurn,
	onOpenQueueModal,
}) => {
	const [text, setText] = useState("");
	const [isSteering, setIsSteering] = useState(false);
	const [showCompletions, setShowCompletions] = useState(false);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// Completions logic for slash commands
	const matchingSkills = skills.filter((s) => s.name.toLowerCase().startsWith(text.toLowerCase()));

	useEffect(() => {
		if (text.startsWith("/") && matchingSkills.length > 0 && !text.includes(" ")) {
			setShowCompletions(true);
			setSelectedIndex(0);
		} else {
			setShowCompletions(false);
		}
	}, [text, matchingSkills.length]);

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (showCompletions) {
			if (e.key === "ArrowDown") {
				e.preventDefault();
				setSelectedIndex((prev) => (prev + 1) % matchingSkills.length);
				return;
			}
			if (e.key === "ArrowUp") {
				e.preventDefault();
				setSelectedIndex((prev) => (prev - 1 + matchingSkills.length) % matchingSkills.length);
				return;
			}
			if (e.key === "Enter" || e.key === "Tab") {
				e.preventDefault();
				const picked = matchingSkills[selectedIndex];
				if (picked) {
					setText(`${picked.name} `);
					setShowCompletions(false);
				}
				return;
			}
			if (e.key === "Escape") {
				setShowCompletions(false);
				return;
			}
		}

		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	};

	const handleSend = () => {
		if (!text.trim()) return;
		onSendMessage(text.trim(), isSteering);
		setText("");
		setIsSteering(false);
	};

	return (
		<footer className="composer">
			<div className="composer-box">
				{/* Completions Popover */}
				{showCompletions && (
					<div className="completions-menu">
						{matchingSkills.map((item, idx) => (
							<div
								key={item.id}
								className={`completion-item ${idx === selectedIndex ? "selected" : ""}`}
								onClick={() => {
									setText(`${item.name} `);
									setShowCompletions(false);
									textareaRef.current?.focus();
								}}
							>
								<span className="completion-name">{item.name}</span>
								<span className="completion-desc">{item.description}</span>
							</div>
						))}
					</div>
				)}

				<textarea
					ref={textareaRef}
					className="composer-textarea"
					placeholder={
						isStreaming
							? isSteering
								? "Type steering prompt to inject mid-flight..."
								: "Agent is generating... Send to queue or click Stop."
							: "Ask a question or type / for skills..."
					}
					value={text}
					onChange={(e) => setText(e.target.value)}
					onKeyDown={handleKeyDown}
					rows={2}
				/>

				<div className="composer-footer">
					<div className="composer-tools">
						{isStreaming && (
							<label
								style={{
									display: "flex",
									alignItems: "center",
									gap: "6px",
									fontSize: "12px",
									cursor: "pointer",
									color: "var(--text-accent)",
								}}
							>
								<input type="checkbox" checked={isSteering} onChange={(e) => setIsSteering(e.target.checked)} />
								<span>Steer Active Turn</span>
							</label>
						)}

						{queuedCount > 0 && (
							<button
								type="button"
								className="btn btn-secondary"
								style={{ padding: "3px 8px", fontSize: "11px" }}
								onClick={onOpenQueueModal}
							>
								Queue ({queuedCount})
							</button>
						)}

						<span style={{ fontSize: "11px", color: "var(--text-muted)" }}>🔒 Private Draft</span>
					</div>

					<div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
						{isStreaming && (
							<button
								type="button"
								className="btn btn-danger composer-action-btn"
								onClick={onCancelTurn}
								title="Stop in-flight turn"
							>
								<span style={{ width: "8px", height: "8px", backgroundColor: "currentColor", borderRadius: "1px" }} />
								<span>Stop</span>
							</button>
						)}

						<button
							type="button"
							className="btn btn-primary composer-action-btn"
							onClick={handleSend}
							disabled={!text.trim()}
						>
							<span>{isSteering ? "Steer" : isStreaming ? "Queue" : "Send"}</span>
							<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
								<line x1="22" y1="2" x2="11" y2="13" />
								<polygon points="22 2 15 22 11 13 2 9 22 2" />
							</svg>
						</button>
					</div>
				</div>
			</div>
		</footer>
	);
};
