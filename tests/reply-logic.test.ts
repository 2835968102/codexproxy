import { describe, expect, it } from "vitest";
import { createPendingUserBubbleTracker, selectLatestAssistantMessage } from "../src/shared/reply-logic.js";

describe("reply logic", () => {
  it("prefers final answer assistant messages when available", () => {
    expect(
      selectLatestAssistantMessage([
        { id: "a1", text: "中间说明", ts: 20, phase: "commentary" },
        { id: "a2", text: "最终答案", ts: 10, phase: "final_answer" }
      ])
    ).toEqual({ id: "a2", text: "最终答案", ts: 10, phase: "final_answer" });
  });

  it("falls back to the newest assistant message when phase is unknown", () => {
    expect(
      selectLatestAssistantMessage([
        { id: "a1", text: "旧消息", ts: 10, phase: null },
        { id: "a2", text: "新消息", ts: 20, phase: null }
      ])
    ).toEqual({ id: "a2", text: "新消息", ts: 20, phase: null });
  });

  it("tracks a single pending user message and clears it when the remote echo arrives", () => {
    const tracker = createPendingUserBubbleTracker();
    tracker.register("hello");

    expect(tracker.consume("hello")).toBe(true);
    expect(tracker.consume("hello")).toBe(false);
    expect(tracker.consume("other")).toBe(false);
  });
});
