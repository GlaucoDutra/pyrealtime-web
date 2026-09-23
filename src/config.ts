export interface AppConfig {
  apiUrl: string;
  accessToken: string;
  avatarUrl: string;
}

const CONFIG_KEY = "pyrealtime-web-config";
const SESSION_CONFIG_KEY = "pyrealtime-web-session-config";
const TOKEN_KEY = "pyrealtime-web-access-token";

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function loadConfig(): AppConfig {
  let saved: Partial<AppConfig> = {};
  try {
    const raw = localStorage.getItem(CONFIG_KEY) ?? sessionStorage.getItem(SESSION_CONFIG_KEY) ?? "{}";
    saved = JSON.parse(raw) as Partial<AppConfig>;
  } catch {
    try { localStorage.removeItem(CONFIG_KEY); } catch { /* storage can be disabled */ }
    try { sessionStorage.removeItem(SESSION_CONFIG_KEY); } catch { /* storage can be disabled */ }
  }

  return {
    apiUrl: normalizeUrl(saved.apiUrl || import.meta.env.VITE_APP_BASE_URL || "http://127.0.0.1:8000"),
    accessToken: safeSessionValue(TOKEN_KEY),
    avatarUrl: normalizeUrl(saved.avatarUrl || import.meta.env.VITE_AVATAR_MODEL_URL || ""),
  };
}

function safeSessionValue(key: string): string {
  try {
    return sessionStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function persistCompactConfig(value: string): void {
  try {
    localStorage.setItem(CONFIG_KEY, value);
    try { sessionStorage.removeItem(SESSION_CONFIG_KEY); } catch { /* optional cleanup */ }
    return;
  } catch {
    // Older prototype builds could leave an unexpectedly large value under
    // this key. Removing it before retrying immediately frees that quota.
    try { localStorage.removeItem(CONFIG_KEY); } catch { /* storage can be disabled */ }
  }

  try {
    localStorage.setItem(CONFIG_KEY, value);
    return;
  } catch {
    // Browsers may expose a very small or disabled localStorage area. The
    // settings are tiny, so sessionStorage is an adequate non-fatal fallback.
  }

  try { sessionStorage.setItem(SESSION_CONFIG_KEY, value); } catch { /* use in-memory config for this page */ }
}

export function saveConfig(config: AppConfig): AppConfig {
  const normalized = {
    apiUrl: normalizeUrl(config.apiUrl),
    accessToken: config.accessToken.trim(),
    avatarUrl: normalizeUrl(config.avatarUrl),
  };

  persistCompactConfig(JSON.stringify({ apiUrl: normalized.apiUrl, avatarUrl: normalized.avatarUrl }));
  try {
    if (normalized.accessToken) sessionStorage.setItem(TOKEN_KEY, normalized.accessToken);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch { /* keep the token in memory for this page */ }
  return normalized;
}

export function authorizationHeaders(accessToken: string): HeadersInit {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}
