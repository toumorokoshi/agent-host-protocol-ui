import type React from "react";
import { useState } from "react";

interface NewSessionModalProps {
	isOpen: boolean;
	onClose: () => void;
	onCreate: (
		title: string,
		workingDirectory: string,
		model: string,
		thinkingLevel: "none" | "low" | "medium" | "high",
	) => void;
}

export const NewSessionModal: React.FC<NewSessionModalProps> = ({ isOpen, onClose, onCreate }) => {
	const [title, setTitle] = useState("");
	const [cwd, setCwd] = useState("/Users/TZTWH7/workspace/agent-host-protocol-ui");
	const [model, setModel] = useState("anthropic/claude-3-7-sonnet");
	const [thinkingLevel, setThinkingLevel] = useState<"none" | "low" | "medium" | "high">("high");

	if (!isOpen) return null;

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		onCreate(title.trim() || "New Agent Session", cwd.trim(), model, thinkingLevel);
		setTitle("");
		onClose();
	};

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal-card" onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">
					<h3 className="modal-title">New Agent Session</h3>
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
							<label className="form-label">Session Title</label>
							<input
								type="text"
								className="form-input"
								placeholder="e.g. Implement authentication middleware"
								value={title}
								onChange={(e) => setTitle(e.target.value)}
							/>
						</div>

						<div className="form-group">
							<label className="form-label">Working Directory</label>
							<input
								type="text"
								className="form-input"
								placeholder="/path/to/project"
								value={cwd}
								onChange={(e) => setCwd(e.target.value)}
								required
							/>
						</div>

						<div className="form-group">
							<label className="form-label">Model Provider</label>
							<select className="form-input" value={model} onChange={(e) => setModel(e.target.value)}>
								<option value="anthropic/claude-3-7-sonnet">anthropic/claude-3-7-sonnet (Extended Thinking)</option>
								<option value="openai/gpt-4o">openai/gpt-4o</option>
								<option value="deepseek/deepseek-r1">deepseek/deepseek-r1 (Reasoning)</option>
								<option value="google/gemini-2.5-pro">google/gemini-2.5-pro</option>
							</select>
						</div>

						<div className="form-group">
							<label className="form-label">Reasoning Effort / Thinking Level</label>
							<select
								className="form-input"
								value={thinkingLevel}
								onChange={(e) => setThinkingLevel(e.target.value as "none" | "low" | "medium" | "high")}
							>
								<option value="high">High (Thorough chain-of-thought)</option>
								<option value="medium">Medium</option>
								<option value="low">Low</option>
								<option value="none">None (Standard generation)</option>
							</select>
						</div>
					</div>

					<div className="modal-footer">
						<button type="button" className="btn btn-secondary" onClick={onClose}>
							Cancel
						</button>
						<button type="submit" className="btn btn-primary">
							Create Session
						</button>
					</div>
				</form>
			</div>
		</div>
	);
};
