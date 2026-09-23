export interface CompletedToolCall {
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface PendingToolCall {
  name: string;
  arguments: string;
}

export class ToolCallAccumulator {
  private readonly pending = new Map<string, PendingToolCall>();
  private readonly completed = new Set<string>();

  begin(callId: string, name: string): void {
    if (!callId || this.completed.has(callId)) return;
    const current = this.pending.get(callId);
    this.pending.set(callId, { name: name || current?.name || "", arguments: current?.arguments ?? "" });
  }

  append(callId: string, delta: string): void {
    if (!callId || this.completed.has(callId)) return;
    const current = this.pending.get(callId) ?? { name: "", arguments: "" };
    current.arguments += delta;
    this.pending.set(callId, current);
  }

  finish(callId: string, name?: string, finalArguments?: string): CompletedToolCall | null {
    if (!callId || this.completed.has(callId)) return null;
    const current = this.pending.get(callId) ?? { name: "", arguments: "" };
    const resolvedName = name || current.name;
    const rawArguments = finalArguments ?? (current.arguments || "{}");
    if (!resolvedName) throw new Error(`Tool call ${callId} did not include a function name`);

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawArguments);
    } catch (error) {
      throw new Error(`Tool ${resolvedName} returned invalid JSON arguments: ${String(error)}`);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`Tool ${resolvedName} arguments must be a JSON object`);
    }

    this.pending.delete(callId);
    this.completed.add(callId);
    return { callId, name: resolvedName, arguments: parsed as Record<string, unknown> };
  }

  reset(): void {
    this.pending.clear();
    this.completed.clear();
  }
}
