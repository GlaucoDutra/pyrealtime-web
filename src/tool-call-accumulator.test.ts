import { describe, expect, it } from "vitest";
import { ToolCallAccumulator } from "./tool-call-accumulator";

describe("ToolCallAccumulator", () => {
  it("assembles streamed JSON arguments", () => {
    const calls = new ToolCallAccumulator();
    calls.begin("call-1", "play_avatar_animation");
    calls.append("call-1", '{"clip_');
    calls.append("call-1", 'name":"yes"}');

    expect(calls.finish("call-1")).toEqual({
      callId: "call-1",
      name: "play_avatar_animation",
      arguments: { clip_name: "yes" },
    });
  });

  it("executes a completed call only once", () => {
    const calls = new ToolCallAccumulator();
    expect(calls.finish("call-2", "echo", "{}")).not.toBeNull();
    expect(calls.finish("call-2", "echo", "{}")).toBeNull();
  });

  it("rejects non-object arguments", () => {
    const calls = new ToolCallAccumulator();
    expect(() => calls.finish("call-3", "echo", "[]")).toThrow("must be a JSON object");
  });
});
