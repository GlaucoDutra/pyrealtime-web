import { describe, expect, it, vi } from "vitest";
import type { BackendClient } from "./backend-client";
import { RealtimeClient } from "./realtime-client";
import { ToolRouter } from "./tool-router";

describe("microphone switching", () => {
  it("replaces the active WebRTC track and preserves the mute state", async () => {
    const oldTrack = { kind: "audio", enabled: false, stop: vi.fn() };
    const newTrack = { kind: "audio", enabled: true, stop: vi.fn() };
    const oldStream = {
      getAudioTracks: () => [oldTrack],
      getTracks: () => [oldTrack],
    };
    const replacementStream = {
      getAudioTracks: () => [newTrack],
      getTracks: () => [newTrack],
    };
    const replaceTrack = vi.fn().mockResolvedValue(undefined);
    const peer = { getSenders: () => [{ track: oldTrack, replaceTrack }] };
    const getUserMedia = vi.fn().mockResolvedValue(replacementStream);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

    const client = new RealtimeClient({} as BackendClient, {} as ToolRouter);
    Object.assign(client, { peer, microphone: oldStream });

    await client.switchMicrophone("usb-mic");

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        deviceId: { exact: "usb-mic" },
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    expect(replaceTrack).toHaveBeenCalledWith(newTrack);
    expect(newTrack.enabled).toBe(false);
    expect(oldTrack.stop).toHaveBeenCalledOnce();
  });

  it("connects in text-only mode without requesting microphone permission", async () => {
    const send = vi.fn();
    const channel = {
      readyState: "open",
      bufferedAmount: 0,
      send,
      close: vi.fn(),
      addEventListener: vi.fn(),
    };
    const peer = {
      createDataChannel: vi.fn(() => channel),
      createOffer: vi.fn().mockResolvedValue({ type: "offer", sdp: "offer" }),
      setLocalDescription: vi.fn().mockResolvedValue(undefined),
      setRemoteDescription: vi.fn().mockResolvedValue(undefined),
      getSenders: vi.fn(() => []),
      close: vi.fn(),
    };
    const getUserMedia = vi.fn();
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    vi.stubGlobal("RTCPeerConnection", class { constructor() { return peer; } });
    const backend = { createSession: vi.fn().mockResolvedValue("answer") };
    const typedBackend = backend as unknown as BackendClient;
    const client = new RealtimeClient(typedBackend, new ToolRouter(typedBackend));

    await client.connect({ useMicrophone: false });
    await (client as unknown as { handleEvent(value: unknown): Promise<void> }).handleEvent({
      type: "session.created",
      session: { instructions: "Help", tools: [] },
    });

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(expect.stringContaining('"output_modalities":["text"]'));
  });
});
