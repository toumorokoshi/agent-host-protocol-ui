import type React from "react";
import { useState } from "react";
import type { UiToolCall } from "../types.ts";
import { formatToolArgumentsPreview } from "../utils/format-tool-args.ts";

export interface ToolCallItemProps {
	tool: UiToolCall;
	onConfirmToolCall?: (toolCallId: string, approved: boolean) => void;
	defaultExpanded?: boolean;
}

export const ToolCallItem: React.FC<ToolCallItemProps> = ({ tool, onConfirmToolCall, defaultExpanded = false }) => {
	const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);
	const argsPreview = formatToolArgumentsPreview(tool.arguments);

	return (
		<div className={`tool-call-card ${isExpanded ? "expanded" : "collapsed"}`}>
			<button
				type="button"
				className="tool-call-header"
				onClick={() => setIsExpanded((prev) => !prev)}
				aria-expanded={isExpanded}
				aria-label={`${tool.name} tool call (${tool.status}). Click to ${isExpanded ? "collapse" : "expand"}`}
			>
				<div className="tool-call-left">
					<svg
						className={`tool-chevron ${isExpanded ? "expanded" : ""}`}
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.5"
						strokeLinecap="round"
						strokeLinejoin="round"
						aria-hidden="true"
					>
						<polyline points="9 18 15 12 9 6" />
					</svg>
					<div className="tool-name-badge">
						<span>⚡</span>
						<span>{tool.name}</span>
					</div>
					{argsPreview && (
						<span
							className="tool-args-preview"
							title={typeof tool.arguments === "string" ? tool.arguments : JSON.stringify(tool.arguments)}
						>
							({argsPreview})
						</span>
					)}
				</div>
				<span className={`tool-status-pill ${tool.status}`}>{tool.status}</span>
			</button>

			{isExpanded && (
				<div className="tool-call-body">
					<div style={{ color: "var(--text-muted)", marginBottom: "4px" }}>// Arguments</div>
					<div>{typeof tool.arguments === "string" ? tool.arguments : JSON.stringify(tool.arguments, null, 2)}</div>

					{tool.result && (
						<div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid var(--border-subtle)" }}>
							<div style={{ color: "var(--text-muted)", marginBottom: "4px" }}>// Result</div>
							<div style={{ color: "var(--text-primary)" }}>{tool.result}</div>
						</div>
					)}
				</div>
			)}

			{tool.status === "pending-confirmation" && onConfirmToolCall && (
				<div className="tool-confirm-bar">
					<span style={{ fontSize: "12px", color: "var(--color-danger)" }}>
						This tool requires explicit approval to execute.
					</span>
					<div style={{ display: "flex", gap: "8px" }}>
						<button
							type="button"
							className="btn btn-secondary"
							style={{ padding: "3px 8px", fontSize: "11px" }}
							onClick={(e) => {
								e.stopPropagation();
								onConfirmToolCall(tool.id, false);
							}}
						>
							Deny
						</button>
						<button
							type="button"
							className="btn btn-primary"
							style={{ padding: "3px 8px", fontSize: "11px" }}
							onClick={(e) => {
								e.stopPropagation();
								onConfirmToolCall(tool.id, true);
							}}
						>
							Approve
						</button>
					</div>
				</div>
			)}
		</div>
	);
};
