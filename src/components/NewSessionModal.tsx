import type React from "react";
import { useEffect, useMemo, useState } from "react";
import type { ModelInfo, UiSession } from "../types.ts";
import { extractDirectoryOptions } from "../utils/directory-options.ts";

export const OTHER_DIRECTORY_VALUE = "__other__";

interface NewSessionModalProps {
	isOpen: boolean;
	defaultDirectory: string;
	availableModels: ModelInfo[];
	existingSessions?: UiSession[];
	onClose: () => void;
	onCreate: (
		title: string,
		workingDirectory: string,
		model: string,
		thinkingLevel: "none" | "low" | "medium" | "high",
	) => void;
}

export const NewSessionModal: React.FC<NewSessionModalProps> = ({
	isOpen,
	defaultDirectory,
	availableModels,
	existingSessions = [],
	onClose,
	onCreate,
}) => {
	const [title, setTitle] = useState("");
	const [model, setModel] = useState(availableModels[0]?.id || "pi");
	const [thinkingLevel, setThinkingLevel] = useState<"none" | "low" | "medium" | "high">("high");

	const directoryOptions = useMemo(
		() => extractDirectoryOptions(defaultDirectory, existingSessions),
		[defaultDirectory, existingSessions],
	);

	const [selectedDirOption, setSelectedDirOption] = useState<string>(() => {
		return directoryOptions[0]?.path || OTHER_DIRECTORY_VALUE;
	});
	const [customCwd, setCustomCwd] = useState<string>(() => {
		return defaultDirectory || "";
	});

	useEffect(() => {
		if (isOpen) {
			const initialDefault = directoryOptions[0]?.path;
			if (initialDefault) {
				setSelectedDirOption(initialDefault);
				setCustomCwd(initialDefault);
			} else {
				setSelectedDirOption(OTHER_DIRECTORY_VALUE);
				setCustomCwd(defaultDirectory || "");
			}

			if (availableModels.length > 0 && (!model || !availableModels.some((m) => m.id === model))) {
				setModel(availableModels[0].id);
			}
		}
	}, [isOpen, directoryOptions, defaultDirectory, availableModels, model]);

	if (!isOpen) return null;

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const finalCwd = (selectedDirOption === OTHER_DIRECTORY_VALUE ? customCwd : selectedDirOption).trim();

		if (!finalCwd) return;

		onCreate(title.trim() || "New Agent Session", finalCwd, model, thinkingLevel);
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
								placeholder="e.g. Implement feature"
								value={title}
								onChange={(e) => setTitle(e.target.value)}
							/>
						</div>

						<div className="form-group">
							<label className="form-label" htmlFor="working-directory-select">
								Working Directory (Remote Host)
							</label>
							{directoryOptions.length > 0 ? (
								<>
									<select
										id="working-directory-select"
										className="form-input"
										value={selectedDirOption}
										onChange={(e) => {
											const val = e.target.value;
											setSelectedDirOption(val);
											if (val !== OTHER_DIRECTORY_VALUE) {
												setCustomCwd(val);
											}
										}}
									>
										<optgroup label="Existing Directories">
											{directoryOptions.map((opt) => (
												<option key={opt.path} value={opt.path}>
													{opt.label}
												</option>
											))}
										</optgroup>
										<option value={OTHER_DIRECTORY_VALUE}>Other (enter custom directory)...</option>
									</select>

									{selectedDirOption === OTHER_DIRECTORY_VALUE ? (
										<div style={{ marginTop: "6px" }}>
											<input
												type="text"
												className="form-input"
												placeholder="/path/to/project"
												value={customCwd}
												onChange={(e) => setCustomCwd(e.target.value)}
												required
											/>
											<span
												style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginTop: "4px" }}
											>
												Enter an absolute path on the remote host.
											</span>
										</div>
									) : (
										<span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
											Selected directory: <code>{selectedDirOption}</code>
										</span>
									)}
								</>
							) : (
								<>
									<input
										type="text"
										className="form-input"
										placeholder="/path/to/project"
										value={customCwd}
										onChange={(e) => setCustomCwd(e.target.value)}
										required
									/>
									<span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
										Host default directory: <code>{defaultDirectory || "/"}</code>
									</span>
								</>
							)}
						</div>

						<div className="form-group">
							<label className="form-label">Model Provider & Model (from Remote Host)</label>
							{availableModels.length > 0 ? (
								<select className="form-input" value={model} onChange={(e) => setModel(e.target.value)}>
									{availableModels.map((m) => (
										<option key={m.id} value={m.id}>
											{m.displayName} ({m.provider})
										</option>
									))}
								</select>
							) : (
								<input
									type="text"
									className="form-input"
									placeholder="e.g. anthropic/claude-3-7-sonnet"
									value={model}
									onChange={(e) => setModel(e.target.value)}
									required
								/>
							)}
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
