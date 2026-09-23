import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  getSavedAvatar,
  MAX_AVATAR_BYTES,
  removeSavedAvatar,
  saveAvatarFile,
  validateAvatarFile,
} from "./avatar-storage";

describe("avatar storage", () => {
  beforeEach(async () => {
    await removeSavedAvatar();
  });

  it("persists and restores a GLB file", async () => {
    const file = new File([new Uint8Array([0x67, 0x6c, 0x54, 0x46])], "robot.glb", {
      type: "model/gltf-binary",
    });

    await saveAvatarFile(file);
    const saved = await getSavedAvatar();

    expect(saved?.name).toBe("robot.glb");
    expect(saved?.size).toBe(4);
    expect(Array.from(new Uint8Array(saved?.data ?? new ArrayBuffer()))).toEqual([0x67, 0x6c, 0x54, 0x46]);
  });

  it("rejects non-GLB and oversized files", () => {
    expect(() => validateAvatarFile(new File(["{}"], "avatar.gltf"))).toThrow("binary .glb");
    const oversized = new File(["x"], "huge.glb");
    Object.defineProperty(oversized, "size", { value: MAX_AVATAR_BYTES + 1 });
    expect(() => validateAvatarFile(oversized)).toThrow("larger than 50 MB");
  });
});
