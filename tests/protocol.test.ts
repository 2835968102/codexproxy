import { describe, expect, it } from "vitest";
import { createEnvelope, envelopeSchema, textInput } from "../src/shared/protocol.js";

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
});
