export interface AppConfig {
  apiUrl: string;
  accessToken: string;
  avatarUrl: string;
}

const CONFIG_KEY = "pyrealtime-web-config";
const TOKEN_KEY = "pyrealtime-web-access-token";

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function loadConfig(): AppConfig {
  let saved: Partial<AppConfig> = {};
  try {
    saved = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? "{}") as Partial<AppConfig>;
  } catch {
    localStorage.removeItem(CONFIG_KEY);
  }

  return {
    apiUrl: normalizeUrl(saved.apiUrl || import.meta.env.VITE_APP_BASE_URL || "http://127.0.0.1:8000"),
    accessToken: sessionStorage.getItem(TOKEN_KEY) ?? "",
    avatarUrl: normalizeUrl(saved.avatarUrl || import.meta.env.VITE_AVATAR_MODEL_URL || ""),
  };
}

export function saveConfig(config: AppConfig): AppConfig {
  const normalized = {
    apiUrl: normalizeUrl(config.apiUrl),
    accessToken: config.accessToken.trim(),
    avatarUrl: normalizeUrl(config.avatarUrl),
  };

  localStorage.setItem(
    CONFIG_KEY,
    JSON.stringify({ apiUrl: normalized.apiUrl, avatarUrl: normalized.avatarUrl }),
  );
  if (normalized.accessToken) {
    sessionStorage.setItem(TOKEN_KEY, normalized.accessToken);
  } else {
    sessionStorage.removeItem(TOKEN_KEY);
  }
  return normalized;
}

export function authorizationHeaders(accessToken: string): HeadersInit {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}
