import { describe, expect, it } from "vitest";
import { createEnvelope, envelopeSchema, textInput } from "../src/shared/protocol.js";
import { messagesFromThreadHistory } from "../src/shared/thread-history.js";

describe("shared protocol", () => {
  it("creates valid envelopes", () => {
    const envelope = createEnvelope("hello", { role: "controller", pairingCode: "123456" });
    expect(envelopeSchema.parse(envelope).type).toBe("hello");
  });

  it("formats Codex text input in app-server shape", () => {
    expect(textInput("hi")).toEqual({
      type: "text",
      text: "hi",
      text_elements: []
    });
  });

  it("converts Codex thread turns to chat messages", () => {
    expect(
      messagesFromThreadHistory({
        turns: [
          {
            id: "turn-2",
            startedAt: 20,
            items: [{ type: "agentMessage", id: "a1", text: "你好", phase: null, memoryCitation: null }]
          },
          {
            id: "turn-1",
            startedAt: 10,
            items: [{ type: "userMessage", id: "u1", content: [textInput("hello")] }]
          }
        ]
      })
    ).toEqual([
      { id: "u1", role: "user", text: "hello", timestamp: 10 },
      { id: "a1", role: "assistant", text: "你好", timestamp: 20 }
    ]);
  });
});
