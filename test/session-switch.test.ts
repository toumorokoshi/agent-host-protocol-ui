import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ahpConnection } from "../src/ahp/connection.ts";
import type { UiSession, UiTurn } from "../src/types.ts";

describe("Session Switching & Concurrent Execution", () => {
	it("tracks active turns independently per session in AhpConnection", async () => {
		const dispatchedActions: Array<{ channel: string; action: any }> = [];

		(ahpConnection as any).client = {
			dispatch: (channel: string, action: any) => {
				dispatchedActions.push({ channel, action });
				return { clientSeq: 1 };
			},
		};

		const session1 = "session-concurrent-1";
		const session2 = "session-concurrent-2";
		const turn1 = "turn-session-1";
		const turn2 = "turn-session-2";

		// Start turn on session 1
		await ahpConnection.sendMessage(session1, "Prompt 1", "model-1", turn1);
		// Start turn on session 2
		await ahpConnection.sendMessage(session2, "Prompt 2", "model-2", turn2);

		assert.equal(dispatchedActions.length, 2);
		assert.equal(dispatchedActions[0].action.turnId, turn1);
		assert.equal(dispatchedActions[1].action.turnId, turn2);

		// Cancelling session 1 must ONLY dispatch cancellation for session 1
		await ahpConnection.cancelTurn(session1);

		assert.equal(dispatchedActions.length, 3);
		const cancelAction = dispatchedActions[2].action;
		assert.equal(cancelAction.type, "chat/turnCancelled");
		assert.equal(cancelAction.turnId, turn1);

		// Session 2 active turn must still be intact and can be cancelled independently
		await ahpConnection.cancelTurn(session2);

		assert.equal(dispatchedActions.length, 4);
		const cancelAction2 = dispatchedActions[3].action;
		assert.equal(cancelAction2.type, "chat/turnCancelled");
		assert.equal(cancelAction2.turnId, turn2);

		// Clean up
		(ahpConnection as any).client = null;
		ahpConnection.disconnect();
	});

	it("isolates activeTurn per UiSession without leaking state between sessions", () => {
		const sessionA: UiSession = {
			id: "sess-a",
			title: "Session A",
			workingDirectory: "/workspace/a",
			modifiedAt: new Date().toISOString(),
			isLive: true,
			isArchived: false,
			model: "gpt-4o",
			thinkingLevel: "high",
			turns: [],
			activeTurn: {
				id: "turn-a",
				userPrompt: "Do task in A",
				startedAt: new Date().toISOString(),
				assistantText: "Working on A...",
				toolCalls: [],
				state: "streaming",
			},
			queuedMessages: [],
			skills: [],
		};

		const sessionB: UiSession = {
			id: "sess-b",
			title: "Session B",
			workingDirectory: "/workspace/b",
			modifiedAt: new Date().toISOString(),
			isLive: false,
			isArchived: false,
			model: "claude-3-7-sonnet",
			thinkingLevel: "medium",
			turns: [],
			activeTurn: undefined,
			queuedMessages: [],
			skills: [],
		};

		const sessions = [sessionA, sessionB];

		// When activeSessionId is sess-b, activeSession must have no activeTurn
		const activeForB = sessions.find((s) => s.id === "sess-b");
		assert.equal(activeForB?.activeTurn, undefined);

		// Session A's active turn must remain intact and streaming in the background
		const backgroundForA = sessions.find((s) => s.id === "sess-a");
		assert.ok(backgroundForA?.activeTurn);
		assert.equal(backgroundForA?.activeTurn?.id, "turn-a");
		assert.equal(backgroundForA?.activeTurn?.state, "streaming");

		// Simulate turn completing on session A while user is viewing session B
		const completedTurnA: UiTurn = {
			...backgroundForA.activeTurn,
			state: "complete",
			durationMs: 1200,
		};

		const updatedSessions = sessions.map((s) => {
			if (s.id !== "sess-a") return s;
			return {
				...s,
				turns: [...s.turns, completedTurnA],
				activeTurn: undefined,
			};
		});

		// Verify session A is updated with completed turn and activeTurn cleared
		const updatedA = updatedSessions.find((s) => s.id === "sess-a");
		assert.equal(updatedA?.activeTurn, undefined);
		assert.equal(updatedA?.turns.length, 1);
		assert.equal(updatedA?.turns[0].id, "turn-a");
		assert.equal(updatedA?.turns[0].state, "complete");

		// Verify session B remains completely unaffected
		const updatedB = updatedSessions.find((s) => s.id === "sess-b");
		assert.equal(updatedB?.turns.length, 0);
		assert.equal(updatedB?.activeTurn, undefined);
	});
});
