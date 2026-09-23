import { authorizationHeaders, type AppConfig } from "./config";

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
}
