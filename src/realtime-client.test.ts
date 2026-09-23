import { describe, expect, it, vi } from "vitest";
import type { BackendClient } from "./backend-client";
import { RealtimeClient } from "./realtime-client";
import type { ToolRouter } from "./tool-router";

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
});
