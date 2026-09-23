import { describe, expect, it } from "vitest";
import { sanitizeAssistantTranscript } from "./transcript";

describe("sanitizeAssistantTranscript", () => {
  it("removes textual imitations of animation tool calls", () => {
    expect(sanitizeAssistantTranscript('Tudo certo. (play_avatar_animation with clip_name = "yes")')).toBe("Tudo certo.");
    expect(sanitizeAssistantTranscript("Great. [play avatar animation: thumbs up]")).toBe("Great.");
  });

  it("removes animation narration", () => {
    expect(sanitizeAssistantTranscript("Vou adicionar uma pequena confirmação visual agora.\nComo posso ajudar?")).toBe("Como posso ajudar?");
  });
});
