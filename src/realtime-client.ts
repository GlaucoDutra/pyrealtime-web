import type { BackendClient } from "./backend-client";
import { MAX_DATA_CHANNEL_BYTES } from "./file-processing";
import { ToolCallAccumulator, type CompletedToolCall } from "./tool-call-accumulator";
import { mergeToolSchemas, type ToolRouter } from "./tool-router";

export type ConnectionState = "idle" | "connecting" | "connected" | "error";

export interface RealtimeClientEvents {
  onStatus?: (state: ConnectionState, label: string) => void;
  onTranscript?: (role: "user" | "assistant", text: string, final: boolean) => void;
  onTool?: (name: string, state: "running" | "complete" | "error") => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onError?: (error: Error) => void;
}

type RealtimeEvent = Record<string, unknown> & { type?: string };

const TOOL_PROTOCOL = [
  "Avatar tools are nonverbal actions and must only be invoked as structured function calls.",
  "Never write or speak a function name, arguments, stage direction, or textual imitation of a tool call.",
  "Never announce, describe, or confirm an avatar animation before or after it happens.",
  "If a structured tool call is unavailable, skip the animation rather than describing it.",
].join(" ");

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function stringifyOutput(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value ?? null);
}

export class RealtimeClient {
  private peer: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private microphone: MediaStream | null = null;
  private remoteAudio: HTMLAudioElement | null = null;
  private abortController: AbortController | null = null;
  private readonly calls = new ToolCallAccumulator();
  private assistantBuffer = "";

  constructor(
    private readonly backend: BackendClient,
    private readonly tools: ToolRouter,
    private readonly events: RealtimeClientEvents = {},
  ) {}

  get connected(): boolean {
    return this.channel?.readyState === "open";
  }

  async connect(microphoneDeviceId = ""): Promise<void> {
    if (this.peer) await this.disconnect();
    this.events.onStatus?.("connecting", "Connecting");
    this.abortController = new AbortController();
    const peer = new RTCPeerConnection();
    this.peer = peer;

    try {
      const microphone = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(microphoneDeviceId ? { deviceId: { exact: microphoneDeviceId } } : {}),
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      this.microphone = microphone;
      for (const track of microphone.getTracks()) peer.addTrack(track, microphone);

      peer.ontrack = (event) => {
        const stream = event.streams[0] ?? new MediaStream([event.track]);
        this.attachRemoteAudio(stream);
        this.events.onRemoteStream?.(stream);
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "failed") this.fail(new Error("WebRTC connection failed"));
        if (peer.connectionState === "disconnected") this.events.onStatus?.("idle", "Disconnected");
      };

      const channel = peer.createDataChannel("oai-events");
      this.channel = channel;
      channel.onmessage = (event) => this.receive(event.data);
      channel.onerror = () => this.fail(new Error("Realtime data channel failed"));
      channel.onclose = () => this.events.onStatus?.("idle", "Disconnected");

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const answerSdp = await this.backend.createSession(offer.sdp ?? "", this.abortController.signal);
      await peer.setRemoteDescription({ type: "answer", sdp: answerSdp });
      await this.waitForDataChannel(channel);
      this.events.onStatus?.("connected", "Connected");
    } catch (error) {
      await this.disconnect();
      this.fail(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private waitForDataChannel(channel: RTCDataChannel): Promise<void> {
    if (channel.readyState === "open") return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("Timed out opening the Realtime channel")), 15_000);
      channel.addEventListener("open", () => {
        window.clearTimeout(timeout);
        resolve();
      }, { once: true });
      channel.addEventListener("error", () => {
        window.clearTimeout(timeout);
        reject(new Error("Failed to open the Realtime channel"));
      }, { once: true });
    });
  }

  private attachRemoteAudio(stream: MediaStream): void {
    this.remoteAudio?.remove();
    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.srcObject = stream;
    audio.style.display = "none";
    document.body.append(audio);
    this.remoteAudio = audio;
    void audio.play().catch(() => undefined);
  }

  private send(event: Record<string, unknown>): void {
    if (!this.channel || this.channel.readyState !== "open") throw new Error("Realtime channel is not open");
    this.channel.send(JSON.stringify(event));
  }

  private async sendSafely(event: Record<string, unknown>): Promise<void> {
    if (!this.channel || this.channel.readyState !== "open") throw new Error("Realtime channel is not open");
    const payload = JSON.stringify(event);
    const bytes = new TextEncoder().encode(payload).length;
    if (bytes > MAX_DATA_CHANNEL_BYTES) {
      throw new Error(`Realtime data-channel payload is too large (${bytes.toLocaleString()} bytes)`);
    }
    while (this.channel.bufferedAmount > 256_000) {
      await new Promise((resolve) => window.setTimeout(resolve, 20));
      if (this.channel.readyState !== "open") throw new Error("Realtime channel closed while sending the file");
    }
    this.channel.send(payload);
    await new Promise((resolve) => window.setTimeout(resolve, 20));
  }

  sendText(text: string): void {
    const value = text.trim();
    if (!value) return;
    this.send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: value }],
      },
    });
    this.send({ type: "response.create" });
  }

  async sendFile(file: File, caption: string, onProgress?: (message: string) => void): Promise<void> {
    const instruction = caption.trim() || "Please analyze this file.";
    const attachment = await this.backend.prepareFile(file, this.abortController?.signal, onProgress);

    if (attachment.kind === "image") {
      if (!attachment.data_url) throw new Error("PyRealtime returned no prepared image content");
      onProgress?.("Sending image…");
      await this.sendSafely({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            { type: "input_text", text: instruction },
            { type: "input_image", image_url: attachment.data_url },
          ],
        },
      });
      this.send({ type: "response.create" });
      return;
    }

    if (attachment.kind === "text") {
      const chunks = attachment.chunks ?? [];
      const truncated = attachment.truncated ?? false;
      if (!chunks.length) throw new Error("PyRealtime returned no extracted file content");
      onProgress?.(`Sending ${chunks.length} file chunk${chunks.length === 1 ? "" : "s"}…`);
      await this.sendSafely({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{
            type: "input_text",
            text: [
              "The user attached a file for analysis.",
              `File name: ${attachment.filename}`,
              `File type: ${attachment.media_type || "unknown"}`,
              `User instruction: ${instruction}`,
              `The content follows in ${chunks.length} chunks. Do not answer until [END OF FILE].`,
            ].join("\n"),
          }],
        },
      });
      for (let index = 0; index < chunks.length; index += 1) {
        onProgress?.(`Sending chunk ${index + 1} of ${chunks.length}…`);
        await this.sendSafely({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: `[FILE CHUNK ${index + 1} OF ${chunks.length}]\n${chunks[index]}` }],
          },
        });
      }
      await this.sendSafely({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{
            type: "input_text",
            text: `[END OF FILE]\n${truncated ? "The file was truncated to 120000 characters.\n" : ""}Analyze the complete file now and follow the user's instruction.`,
          }],
        },
      });
      this.send({ type: "response.create" });
      return;
    }

    onProgress?.("Sending file notice…");
    await this.sendSafely({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{
          type: "input_text",
          text: [
            "The user attached a file that cannot be parsed directly in this Realtime session.",
            `File name: ${attachment.filename}`,
            `File type: ${attachment.media_type || "unknown"}`,
            `User instruction: ${instruction}`,
            attachment.message || "This file type could not be prepared.",
          ].join("\n"),
        }],
      },
    });
    this.send({ type: "response.create" });
  }

  setMicrophoneMuted(muted: boolean): void {
    for (const track of this.microphone?.getAudioTracks() ?? []) track.enabled = !muted;
  }

  async switchMicrophone(deviceId = ""): Promise<void> {
    if (!this.peer || !this.microphone) throw new Error("Connect before switching microphones");
    const replacement = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    const newTrack = replacement.getAudioTracks()[0];
    const sender = this.peer.getSenders().find((candidate) => candidate.track?.kind === "audio");
    if (!newTrack || !sender) {
      replacement.getTracks().forEach((track) => track.stop());
      throw new Error("The selected microphone could not be attached to the session");
    }
    const oldMicrophone = this.microphone;
    newTrack.enabled = oldMicrophone.getAudioTracks()[0]?.enabled ?? true;
    try {
      await sender.replaceTrack(newTrack);
      this.microphone = replacement;
      oldMicrophone.getTracks().forEach((track) => track.stop());
    } catch (error) {
      replacement.getTracks().forEach((track) => track.stop());
      throw error;
    }
  }

  private receive(raw: unknown): void {
    if (typeof raw !== "string") return;
    let message: RealtimeEvent;
    try {
      message = JSON.parse(raw) as RealtimeEvent;
    } catch {
      return;
    }
    void this.handleEvent(message).catch((error) => this.fail(error instanceof Error ? error : new Error(String(error))));
  }

  private async handleEvent(message: RealtimeEvent): Promise<void> {
    const type = String(message.type ?? "");
    if (type === "error") {
      const error = record(message.error);
      throw new Error(String(error.message ?? "Realtime API error"));
    }

    if (type === "session.created") {
      const session = record(message.session);
      const instructions = [String(session.instructions ?? "").trim(), TOOL_PROTOCOL].filter(Boolean).join("\n\n");
      this.send({
        type: "session.update",
        session: {
          type: "realtime",
          instructions,
          tools: mergeToolSchemas(session.tools),
          tool_choice: "auto",
        },
      });
      return;
    }

    if (type === "conversation.item.input_audio_transcription.completed") {
      const transcript = String(message.transcript ?? "").trim();
      if (transcript) this.events.onTranscript?.("user", transcript, true);
      return;
    }

    if (["response.output_audio_transcript.delta", "response.audio_transcript.delta", "response.output_text.delta"].includes(type)) {
      const delta = String(message.delta ?? "");
      this.assistantBuffer += delta;
      this.events.onTranscript?.("assistant", this.assistantBuffer, false);
      return;
    }

    if (["response.output_audio_transcript.done", "response.audio_transcript.done", "response.output_text.done"].includes(type)) {
      const text = String(message.transcript ?? message.text ?? this.assistantBuffer).trim();
      if (text) this.events.onTranscript?.("assistant", text, true);
      this.assistantBuffer = "";
      return;
    }

    if (type === "response.output_item.added") {
      const item = record(message.item);
      if (item.type === "function_call") {
        this.calls.begin(String(item.call_id ?? ""), String(item.name ?? ""));
      }
      return;
    }

    if (type === "response.function_call_arguments.delta") {
      this.calls.append(String(message.call_id ?? ""), String(message.delta ?? ""));
      return;
    }

    if (type === "response.function_call_arguments.done") {
      const call = this.calls.finish(
        String(message.call_id ?? ""),
        String(message.name ?? ""),
        typeof message.arguments === "string" ? message.arguments : undefined,
      );
      if (call) await this.executeTool(call);
      return;
    }

    if (type === "response.output_item.done") {
      const item = record(message.item);
      if (item.type !== "function_call") return;
      const call = this.calls.finish(
        String(item.call_id ?? ""),
        String(item.name ?? ""),
        typeof item.arguments === "string" ? item.arguments : undefined,
      );
      if (call) await this.executeTool(call);
    }
  }

  private async executeTool(call: CompletedToolCall): Promise<void> {
    this.events.onTool?.(call.name, "running");
    try {
      const result = await this.tools.execute(call.name, call.arguments);
      this.send({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: call.callId,
          output: stringifyOutput(result.output),
        },
      });
      this.events.onTool?.(call.name, "complete");
      if (result.continueResponse) {
        this.send({
          type: "response.create",
          response: {
            instructions: "Continue naturally using the tool result. Do not mention tool mechanics or avatar animations.",
          },
        });
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.send({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: call.callId,
          output: JSON.stringify({ ok: false, error: detail }),
        },
      });
      this.events.onTool?.(call.name, "error");
      this.send({
        type: "response.create",
        response: { instructions: "Continue helpfully without exposing tool internals." },
      });
    }
  }

  private fail(error: Error): void {
    this.events.onStatus?.("error", "Connection error");
    this.events.onError?.(error);
  }

  async disconnect(): Promise<void> {
    this.abortController?.abort();
    this.abortController = null;
    this.calls.reset();
    this.assistantBuffer = "";
    if (this.channel && this.channel.readyState === "open") {
      try { this.send({ type: "response.cancel" }); } catch { /* already closing */ }
    }
    this.channel?.close();
    this.channel = null;
    this.peer?.getSenders().forEach((sender) => sender.track?.stop());
    this.peer?.close();
    this.peer = null;
    this.microphone?.getTracks().forEach((track) => track.stop());
    this.microphone = null;
    if (this.remoteAudio) {
      this.remoteAudio.pause();
      this.remoteAudio.srcObject = null;
      this.remoteAudio.remove();
      this.remoteAudio = null;
    }
    this.events.onStatus?.("idle", "Ready");
  }
}
