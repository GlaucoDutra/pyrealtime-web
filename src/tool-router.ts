import type { BackendClient } from "./backend-client";

export interface AvatarToolHost {
  availableAnimations(): string[];
  playAnimation(name: string, options?: { loop?: boolean; returnToIdle?: boolean }): Promise<unknown>;
}

export interface ToolExecutionResult {
  output: unknown;
  continueResponse: boolean;
}

export const avatarToolSchemas = [
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
  ) {}

  async execute(name: string, argumentsValue: Record<string, unknown>): Promise<ToolExecutionResult> {
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

    return {
      output: await this.backend.callTool(name, argumentsValue),
      continueResponse: true,
    };
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
