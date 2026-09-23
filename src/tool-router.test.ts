import { describe, expect, it, vi } from "vitest";
import { mergeToolSchemas, ToolRouter } from "./tool-router";

describe("ToolRouter", () => {
  it("executes avatar animation locally without starting a narration response", async () => {
    const backend = { callTool: vi.fn() };
    const avatar = {
      availableAnimations: () => ["idle", "yes"],
      playAnimation: vi.fn().mockResolvedValue({ ok: true }),
    };
    const router = new ToolRouter(backend as never, avatar);

    const result = await router.execute("play_avatar_animation", { clip_name: "yes" });

    expect(avatar.playAnimation).toHaveBeenCalledWith("yes", { loop: false, returnToIdle: true });
    expect(result.continueResponse).toBe(false);
    expect(backend.callTool).not.toHaveBeenCalled();
  });

  it("forwards non-avatar tools to PyRealtime", async () => {
    const backend = { callTool: vi.fn().mockResolvedValue({ value: "hello" }) };
    const avatar = { availableAnimations: () => [], playAnimation: vi.fn() };
    const router = new ToolRouter(backend as never, avatar);

    const result = await router.execute("echo", { text: "hello" });

    expect(backend.callTool).toHaveBeenCalledWith("echo", { text: "hello" });
    expect(result.continueResponse).toBe(true);
  });
});

describe("mergeToolSchemas", () => {
  it("preserves backend tools and adds avatar tools without duplicates", () => {
    const tools = mergeToolSchemas([{ type: "function", name: "echo" }]);
    expect(tools.map((tool) => (tool as { name: string }).name)).toEqual([
      "echo",
      "get_available_animations",
      "play_avatar_animation",
    ]);
  });
});
