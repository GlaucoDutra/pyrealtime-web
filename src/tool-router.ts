import type { BackendClient } from "./backend-client";

export interface AvatarToolHost {
  availableAnimations(): string[];
  playAnimation(name: string, options?: { loop?: boolean; returnToIdle?: boolean }): Promise<unknown>;
}

export interface ToolExecutionResult {
  output: unknown;
  continueResponse: boolean;
}

export interface ToolRouterEvents {
  onGeneratedImage?: (dataUrl: string, description: string) => void;
}

export const avatarToolSchemas = [
  {
    type: "function",
    name: "navigate_to_url",
    description: "Open an HTTP or HTTPS URL only when the user explicitly requests navigation.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "Absolute URL starting with https:// or http://" },
        new_tab: { type: "boolean", description: "Open in a new tab. Defaults to true." },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_available_animations",
    description:
      "Return animation clip names available on the visible avatar. Call this as a real structured function. Never print or narrate the call.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "play_avatar_animation",
    description:
      "Play a visible avatar gesture. Use this only as a structured function call. Never mention, announce, describe, or confirm the animation in assistant text.",
    parameters: {
      type: "object",
      properties: {
        clip_name: {
          type: "string",
          description: "An exact or partial clip name returned by get_available_animations.",
        },
        loop: { type: "boolean", description: "Whether the clip should repeat. Defaults to false." },
        return_to_idle: { type: "boolean", description: "Return to idle after playback. Defaults to true." },
      },
      required: ["clip_name"],
      additionalProperties: false,
    },
  },
] as const;

export class ToolRouter {
  constructor(
    private readonly backend: BackendClient,
    private readonly avatar: AvatarToolHost,
    private readonly events: ToolRouterEvents = {},
  ) {}

  async execute(name: string, argumentsValue: Record<string, unknown>): Promise<ToolExecutionResult> {
    if (name === "navigate_to_url") {
      const rawUrl = String(argumentsValue.url ?? "").trim();
      if (!rawUrl) throw new Error("navigate_to_url requires url");
      const url = new URL(rawUrl);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP and HTTPS URLs are allowed");
      const newTab = argumentsValue.new_tab !== false;
      // Passing `noopener` as a window feature makes some browsers return null
      // even when the tab opened successfully. Open first, then sever the
      // opener synchronously so null remains a reliable popup-block signal.
      const opened = window.open(url.toString(), newTab ? "_blank" : "_self");
      if (!opened && newTab) throw new Error("The browser blocked the new tab");
      if (newTab && opened) opened.opener = null;
      // Navigation is already the requested visible action. A follow-up model
      // response adds redundant narration and can falsely reinterpret success.
      return { output: { ok: true, url: url.toString() }, continueResponse: false };
    }

    if (name === "get_available_animations") {
      const animations = this.avatar.availableAnimations();
      return {
        output: { ok: true, count: animations.length, animation_names: animations },
        continueResponse: true,
      };
    }

    if (name === "play_avatar_animation") {
      const clipName = String(argumentsValue.clip_name ?? "").trim();
      if (!clipName) throw new Error("play_avatar_animation requires clip_name");
      const output = await this.avatar.playAnimation(clipName, {
        loop: argumentsValue.loop === true,
        returnToIdle: argumentsValue.return_to_idle !== false,
      });
      // The gesture is nonverbal behavior. Starting another response here often
      // makes a model narrate or confirm the animation, so the continuation is suppressed.
      return { output, continueResponse: false };
    }

    const output = await this.backend.callTool(name, argumentsValue);
    if (name === "generate_image" && output !== null && typeof output === "object") {
      const result = output as Record<string, unknown>;
      const dataUrl = typeof result.image_data_uri === "string" ? result.image_data_uri : "";
      if (dataUrl.startsWith("data:image/")) {
        this.events.onGeneratedImage?.(dataUrl, String(result.revised_prompt ?? "Generated image"));
        const safeOutput: Record<string, unknown> = {
          ...result,
          message: "The image was generated and shown to the user.",
        };
        delete safeOutput.image_data_uri;
        return { output: safeOutput, continueResponse: true };
      }
    }
    return { output, continueResponse: true };
  }
}

export function mergeToolSchemas(existing: unknown): unknown[] {
  const merged = Array.isArray(existing) ? [...existing] : [];
  for (const schema of avatarToolSchemas) {
    const index = merged.findIndex(
      (candidate) =>
        candidate !== null &&
        typeof candidate === "object" &&
        "name" in candidate &&
        (candidate as { name?: unknown }).name === schema.name,
    );
    if (index >= 0) merged[index] = schema;
    else merged.push(schema);
  }
  return merged;
}
