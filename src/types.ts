/**
 * Shared Type Definitions for Agent Host Protocol UI
 */

export interface HostConfig {
	id: string;
	name: string;
	url: string; // e.g., ws://127.0.0.1:63877
	token?: string;
	isDefault?: boolean;
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting" | "error";

export interface ModelInfo {
	id: string;
	displayName: string;
	provider: string;
	supportsThinking?: boolean;
}

export interface SkillItem {
	id: string;
	name: string;
	description: string;
	type: "skill" | "prompt-template" | "command";
}

export interface UiToolCall {
	id: string;
	name: string;
	arguments: Record<string, unknown> | string;
	status: "streaming" | "pending-confirmation" | "running" | "completed" | "cancelled" | "error";
	result?: string;
	error?: string;
}

export interface UiInputQuestion {
	id: string;
	title?: string;
	message: string;
	kind: "text" | "number" | "boolean" | "single-select" | "multi-select";
	required?: boolean;
	options?: Array<{ id: string; label: string; description?: string }>;
	defaultValue?: string | number | boolean;
}

export interface UiInputRequest {
	id: string;
	message?: string;
	questions?: UiInputQuestion[];
	answers?: Record<string, string | number | boolean | string[]>;
	submitted?: boolean;
}

export interface UiTurn {
	id: string;
	userPrompt: string;
	startedAt: string;
	durationMs?: number;
	model?: string;
	thinkingContent?: string;
	thinkingDurationMs?: number;
	assistantText: string;
	toolCalls: UiToolCall[];
	inputRequest?: UiInputRequest;
	resumableError?: string;
	tokens?: {
		prompt: number;
		completion: number;
		cached?: number;
	};
	state: "streaming" | "complete" | "error" | "cancelled";
}

export interface UiSession {
	id: string;
	title: string;
	workingDirectory: string;
	modifiedAt: string;
	isLive: boolean;
	isArchived: boolean;
	model: string;
	thinkingLevel: "none" | "low" | "medium" | "high";
	turns: UiTurn[];
	activeTurn?: UiTurn;
	queuedMessages: string[];
	skills: SkillItem[];
}
