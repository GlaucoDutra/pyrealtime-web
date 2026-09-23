import { afterEach, describe, expect, it, vi } from "vitest";
import { mergeToolSchemas, ToolRouter } from "./tool-router";

afterEach(() => vi.unstubAllGlobals());

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

  it("shows generated images locally without returning base64 through Realtime", async () => {
    const backend = { callTool: vi.fn().mockResolvedValue({
      ok: true,
      image_data_uri: "data:image/png;base64,aW1n",
      revised_prompt: "A blue robot",
    }) };
    const avatar = { availableAnimations: () => [], playAnimation: vi.fn() };
    const onGeneratedImage = vi.fn();
    const router = new ToolRouter(backend as never, avatar, { onGeneratedImage });

    const result = await router.execute("generate_image", { prompt: "robot" });

    expect(onGeneratedImage).toHaveBeenCalledWith("data:image/png;base64,aW1n", "A blue robot");
    expect(result.output).not.toHaveProperty("image_data_uri");
  });

  it("handles safe navigation in the browser", async () => {
    const open = vi.fn().mockReturnValue({});
    vi.stubGlobal("window", { open });
    const router = new ToolRouter({ callTool: vi.fn() } as never, {
      availableAnimations: () => [],
      playAnimation: vi.fn(),
    });

    await router.execute("navigate_to_url", { url: "https://example.com/path", new_tab: true });

    expect(open).toHaveBeenCalledWith("https://example.com/path", "_blank", "noopener,noreferrer");
  });
});

describe("mergeToolSchemas", () => {
  it("preserves backend tools and adds avatar tools without duplicates", () => {
    const tools = mergeToolSchemas([{ type: "function", name: "echo" }]);
    expect(tools.map((tool) => (tool as { name: string }).name)).toEqual([
      "echo",
      "navigate_to_url",
      "get_available_animations",
      "play_avatar_animation",
    ]);
  });
});
