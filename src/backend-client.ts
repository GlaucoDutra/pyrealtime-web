import { authorizationHeaders, type AppConfig } from "./config";
import { validateAttachmentSelection, type PreparedAttachment } from "./file-processing";

async function errorMessage(response: Response): Promise<string> {
  const body = (await response.text()).slice(0, 1_000);
  try {
    const parsed = JSON.parse(body) as { detail?: string };
    return parsed.detail || body || response.statusText;
  } catch {
    return body || response.statusText;
  }
}

export class BackendClient {
  constructor(private readonly config: AppConfig) {}

  async createSession(sdpOffer: string, signal?: AbortSignal): Promise<string> {
    const response = await fetch(`${this.config.apiUrl}/v1/realtime/session`, {
      method: "POST",
      headers: {
        ...authorizationHeaders(this.config.accessToken),
        "Content-Type": "application/sdp",
      },
      body: sdpOffer,
      signal,
    });
    if (!response.ok) {
      throw new Error(`Session request failed (${response.status}): ${await errorMessage(response)}`);
    }
    return response.text();
  }

  async callTool(name: string, argumentsValue: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    if (!/^[a-z0-9_.-]{1,64}$/.test(name)) throw new Error(`Invalid tool name: ${name}`);
    const response = await fetch(`${this.config.apiUrl}/v1/tools/${encodeURIComponent(name)}`, {
      method: "POST",
      headers: {
        ...authorizationHeaders(this.config.accessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(argumentsValue),
      signal,
    });
    if (!response.ok) {
      throw new Error(`Tool ${name} failed (${response.status}): ${await errorMessage(response)}`);
    }
    if (response.status === 204) return null;
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }

  prepareFile(file: File, signal?: AbortSignal, onProgress?: (message: string) => void): Promise<PreparedAttachment> {
    validateAttachmentSelection(file);
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("POST", `${this.config.apiUrl}/v1/files/prepare`);
      request.responseType = "json";
      request.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      request.setRequestHeader("X-Filename", encodeURIComponent(file.name));
      if (this.config.accessToken) request.setRequestHeader("Authorization", `Bearer ${this.config.accessToken}`);

      const abort = () => request.abort();
      signal?.addEventListener("abort", abort, { once: true });
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress?.(`Uploading ${Math.round((event.loaded / event.total) * 100)}%…`);
        } else {
          onProgress?.("Uploading file…");
        }
      };
      request.upload.onload = () => onProgress?.("Processing file on PyRealtime…");
      request.onerror = () => reject(new Error("Could not reach the PyRealtime file endpoint"));
      request.onabort = () => reject(new DOMException("File preparation was cancelled", "AbortError"));
      request.onload = () => {
        signal?.removeEventListener("abort", abort);
        if (request.status >= 200 && request.status < 300) {
          resolve(request.response as PreparedAttachment);
          return;
        }
        const response = request.response as { detail?: string } | null;
        reject(new Error(`File preparation failed (${request.status}): ${response?.detail || request.statusText}`));
      };
      request.send(file);
    });
  }
}
