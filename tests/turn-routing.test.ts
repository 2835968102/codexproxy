import { describe, expect, it } from "vitest";
import { activeTurnIdFromTurns, buildTurnSendRequest } from "../src/shared/turn-routing.js";

describe("turn routing", () => {
  it("starts a new turn when the thread has no active turn", () => {
    expect(
      buildTurnSendRequest({
        threadId: "thread-1",
        prompt: "hello",
        cwd: "D:/repo"
      })
    ).toEqual({
      method: "turn.start",
      params: {
        threadId: "thread-1",
        prompt: "hello",
        cwd: "D:/repo"
      }
    });
  });

  it("steers the active turn when one is known", () => {
    expect(
      buildTurnSendRequest({
        threadId: "thread-1",
        prompt: "continue",
        cwd: "D:/repo",
        activeTurnId: "turn-1"
      })
    ).toEqual({
      method: "turn.steer",
      params: {
        threadId: "thread-1",
        expectedTurnId: "turn-1",
        prompt: "continue"
      }
    });
  });

  it("finds the newest unfinished turn from thread history", () => {
    expect(
      activeTurnIdFromTurns([
        { id: "old-running", status: "running", startedAt: 10 },
        { id: "done", status: "completed", startedAt: 30, completedAt: 40 },
        { id: "new-running", status: "in_progress", startedAt: 50 }
      ])
    ).toBe("new-running");
  });

  it("ignores completed and statusless historical turns", () => {
    expect(
      activeTurnIdFromTurns([
        { id: "completed", status: "completed", startedAt: 10 },
        { id: "old-shape-without-status", startedAt: 20 }
      ])
    ).toBeUndefined();
  });
});
