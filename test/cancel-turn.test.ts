import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ahpConnection } from "../src/ahp/connection.ts";

describe("AhpConnection Turn Cancellation", () => {
	it("dispatches chat/turnCancelled with matching turnId and numeric duration", async () => {
		const dispatchedActions: Array<{ channel: string; action: any }> = [];

		// Mock AhpClient
		(ahpConnection as any).client = {
			dispatch: (channel: string, action: any) => {
				dispatchedActions.push({ channel, action });
				return { clientSeq: 1 };
			},
		};

		const sessionId = "session-test-cancel-1";
		const explicitTurnId = "turn-custom-uuid-12345";

		// Send message with explicit turn ID
		const returnedTurnId = await ahpConnection.sendMessage(
			sessionId,
			"What is the weather today?",
			"model-1",
			explicitTurnId,
		);

		assert.equal(returnedTurnId, explicitTurnId);
		assert.equal(dispatchedActions.length, 1);
		assert.equal(dispatchedActions[0].action.type, "chat/turnStarted");
		assert.equal(dispatchedActions[0].action.turnId, explicitTurnId);

		// Now cancel turn without explicit turnId - should resolve from tracked active turn
		await ahpConnection.cancelTurn(sessionId);

		assert.equal(dispatchedActions.length, 2);
		const cancelAction = dispatchedActions[1].action;
		assert.equal(cancelAction.type, "chat/turnCancelled");
		assert.equal(cancelAction.turnId, explicitTurnId, "Should use matching active turn ID");
		assert.equal(typeof cancelAction.duration, "number", "Duration must be a number");
		assert.ok(cancelAction.duration >= 0, "Duration must be non-negative");

		// Clean up
		(ahpConnection as any).client = null;
		ahpConnection.disconnect();
	});

	it("uses explicit turnId passed to cancelTurn if provided", async () => {
		const dispatchedActions: Array<{ channel: string; action: any }> = [];

		(ahpConnection as any).client = {
			dispatch: (channel: string, action: any) => {
				dispatchedActions.push({ channel, action });
				return { clientSeq: 1 };
			},
		};

		const sessionId = "session-test-cancel-2";
		await ahpConnection.cancelTurn(sessionId, "override-turn-id-999");

		assert.equal(dispatchedActions.length, 1);
		assert.equal(dispatchedActions[0].action.type, "chat/turnCancelled");
		assert.equal(dispatchedActions[0].action.turnId, "override-turn-id-999");
		assert.equal(typeof dispatchedActions[0].action.duration, "number");

		(ahpConnection as any).client = null;
		ahpConnection.disconnect();
	});
});
