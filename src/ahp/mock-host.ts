/**
 * In-Memory Simulated AHP Host for POC demonstration and offline evaluation.
 * Mirrors the behavior of real AHP hosts (like pi-agent-host-protocol)
 * including streaming, thinking accordions, tool execution, and elicitations.
 */

import type { SkillItem, UiSession, UiToolCall, UiTurn } from "../types.ts";

const SAMPLE_SKILLS: SkillItem[] = [
	{ id: "ahp", name: "/ahp", description: "Control and inspect Agent Host Protocol status", type: "command" },
	{ id: "commit", name: "/commit", description: "Inspect diff and author conventional commit message", type: "skill" },
	{ id: "test", name: "/test", description: "Run test suite and report failures with fixes", type: "skill" },
	{
		id: "refactor",
		name: "/refactor",
		description: "Clean up code architecture and eliminate redundant allocations",
		type: "prompt-template",
	},
];

export function createInitialMockSessions(): UiSession[] {
	return [
		{
			id: "session-tui-live-1",
			title: "Fix authentication token expiry in WebSocket client",
			workingDirectory: "/Users/TZTWH7/workspace/agent-host-protocol-ui",
			modifiedAt: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
			isLive: true,
			isArchived: false,
			model: "anthropic/claude-3-7-sonnet",
			thinkingLevel: "high",
			queuedMessages: ["Run unit tests once you finish"],
			skills: SAMPLE_SKILLS,
			turns: [
				{
					id: "turn-1",
					userPrompt:
						"The WebSocket connection token seems to expire after 1 hour. Can you trace where token refreshment is handled?",
					startedAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
					durationMs: 3420,
					model: "anthropic/claude-3-7-sonnet",
					thinkingContent:
						"Examining the WebSocket client connection lifecycle. Need to inspect token parsing and check if the client auto-refreshes tokens upon reconnect.\n1. Check `src/ahp/connection.ts`.\n2. Look for `reconnect` action logic and error code `-32005`.",
					thinkingDurationMs: 1450,
					assistantText:
						"I have analyzed the WebSocket client lifecycle. The token was read only during initial instantiation. I am now checking how reconnection handles token expiry.\n\nHere is what I found in `src/ahp/connection.ts`:\n```ts\nexport function connect(url: string, token?: string) {\n  const authUrl = token ? `${url}?tkn=${encodeURIComponent(token)}` : url;\n  return new WebSocket(authUrl);\n}\n```\n\nI can add an automatic token refresh hook.",
					toolCalls: [
						{
							id: "tool-call-1",
							name: "grep_search",
							arguments: { query: "tkn=", searchPath: "src/" },
							status: "completed",
							result: "Found 2 matches in src/ahp/connection.ts",
						},
						{
							id: "tool-call-2",
							name: "view_file",
							arguments: { absolutePath: "/Users/TZTWH7/workspace/agent-host-protocol-ui/src/ahp/connection.ts" },
							status: "completed",
							result: "File lines 1-45 viewed successfully.",
						},
					],
					tokens: { prompt: 1420, completion: 485, cached: 890 },
					state: "complete",
				},
			],
		},
		{
			id: "session-past-2",
			title: "Initialize repository specifications and architecture",
			workingDirectory: "/Users/TZTWH7/workspace/agent-host-protocol-ui",
			modifiedAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
			isLive: false,
			isArchived: false,
			model: "openai/gpt-4o",
			thinkingLevel: "none",
			queuedMessages: [],
			skills: SAMPLE_SKILLS,
			turns: [
				{
					id: "turn-init",
					userPrompt: "Create initial spec for agent-host-protocol-ui",
					startedAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
					durationMs: 2100,
					model: "openai/gpt-4o",
					assistantText: "I created `specs/agent-host-protocol-ui.md` with the full specification.",
					toolCalls: [
						{
							id: "tc-write",
							name: "write_to_file",
							arguments: { path: "specs/agent-host-protocol-ui.md" },
							status: "completed",
							result: "Created specs/agent-host-protocol-ui.md",
						},
					],
					tokens: { prompt: 850, completion: 230 },
					state: "complete",
				},
			],
		},
	];
}

/**
 * Simulates an interactive turn streaming process for the POC.
 */
export function simulateTurnStream(
	prompt: string,
	model: string,
	thinkingLevel: string,
	onUpdate: (turnDelta: Partial<UiTurn>) => void,
	onComplete: () => void,
): () => void {
	let isCancelled = false;
	const turnId = `turn-${Date.now()}`;
	const startedAt = new Date().toISOString();

	let assistantText = "";
	let thinkingContent = "";

	const timer = setTimeout(async () => {
		if (isCancelled) return;

		// Step 1: Thinking phase if enabled
		if (thinkingLevel !== "none") {
			const thinkingSteps = [
				`Analyzing user prompt: "${prompt}"...`,
				"\nIdentifying target files and relevant AHP protocol specifications...",
				"\nFormulating optimal implementation strategy and validating safety guardrails.",
			];

			for (let i = 0; i < thinkingSteps.length; i++) {
				if (isCancelled) return;
				thinkingContent += thinkingSteps[i];
				onUpdate({
					id: turnId,
					userPrompt: prompt,
					startedAt,
					model,
					thinkingContent,
					thinkingDurationMs: (i + 1) * 600,
					assistantText: "",
					toolCalls: [],
					state: "streaming",
				});
				await new Promise((r) => setTimeout(r, 450));
			}
		}

		if (isCancelled) return;

		// Step 2: Tool call simulation
		const toolCall: UiToolCall = {
			id: `tc-${Date.now()}`,
			name: "run_command",
			arguments: { command: "git status --short", cwd: "/Users/TZTWH7/workspace/agent-host-protocol-ui" },
			status: "running",
		};

		onUpdate({
			toolCalls: [toolCall],
		});

		await new Promise((r) => setTimeout(r, 650));
		if (isCancelled) return;

		toolCall.status = "completed";
		toolCall.result = "M src/App.tsx\n?? src/components/NewFeature.tsx";

		onUpdate({
			toolCalls: [toolCall],
		});

		await new Promise((r) => setTimeout(r, 400));
		if (isCancelled) return;

		// Step 3: Stream assistant text tokens
		const textChunks = [
			"I have investigated your request. ",
			"The workspace status indicates active changes in the UI layer.\n\n",
			"Here is the proposed solution:\n",
			"```typescript\n",
			"// Client-Side WebSocket Connection Hook\n",
			'import { WebSocketTransport } from "@microsoft/agent-host-protocol/ws";\n\n',
			"export async function setupClient(url: string) {\n",
			"  const transport = await WebSocketTransport.connect(url);\n",
			"  return transport;\n",
			"}\n",
			"```\n\n",
			"All user inputs remain encrypted at rest and private to your browser session.",
		];

		for (const chunk of textChunks) {
			if (isCancelled) return;
			assistantText += chunk;
			onUpdate({
				assistantText,
				tokens: {
					prompt: 520,
					completion: assistantText.length / 4,
					cached: 120,
				},
			});
			await new Promise((r) => setTimeout(r, 120));
		}

		if (!isCancelled) {
			onUpdate({
				state: "complete",
				durationMs: 2800,
			});
			onComplete();
		}
	}, 100);

	return () => {
		isCancelled = true;
		clearTimeout(timer);
		onUpdate({ state: "cancelled" });
	};
}
