import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig, saveConfig } from "./config";

function memoryStorage(options: { failWrites?: number } = {}): Storage {
  const values = new Map<string, string>();
  let failedWrites = 0;
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => {
      if (failedWrites < (options.failWrites ?? 0)) {
        failedWrites += 1;
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      }
      values.set(key, value);
    },
  };
}

describe("configuration persistence", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("sessionStorage", memoryStorage());
  });

  it("stores only compact public configuration in localStorage", () => {
    saveConfig({ apiUrl: "http://127.0.0.1:8000/", accessToken: "secret", avatarUrl: "" });

    expect(localStorage.getItem("pyrealtime-web-config")).toBe(
      '{"apiUrl":"http://127.0.0.1:8000","avatarUrl":""}',
    );
    expect(localStorage.getItem("pyrealtime-web-config")).not.toContain("secret");
    expect(sessionStorage.getItem("pyrealtime-web-access-token")).toBe("secret");
  });

  it("recovers from a quota error by removing the old record and retrying", () => {
    vi.stubGlobal("localStorage", memoryStorage({ failWrites: 1 }));

    expect(() => saveConfig({ apiUrl: "http://localhost:8000", accessToken: "", avatarUrl: "" })).not.toThrow();
    expect(loadConfig().apiUrl).toBe("http://localhost:8000");
  });

  it("falls back to sessionStorage when localStorage remains unavailable", () => {
    vi.stubGlobal("localStorage", memoryStorage({ failWrites: 10 }));

    expect(() => saveConfig({ apiUrl: "http://localhost:9000", accessToken: "", avatarUrl: "" })).not.toThrow();
    expect(loadConfig().apiUrl).toBe("http://localhost:9000");
  });
});
