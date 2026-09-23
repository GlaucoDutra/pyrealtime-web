import "./style.css";
import { AvatarStage } from "./avatar-stage";
import { BackendClient } from "./backend-client";
import { loadConfig, saveConfig, type AppConfig } from "./config";
import { RealtimeClient, type ConnectionState } from "./realtime-client";
import { ToolRouter } from "./tool-router";
import { sanitizeAssistantTranscript } from "./transcript";

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing required element #${id}`);
  return value as T;
}

const canvas = element<HTMLCanvasElement>("avatar-canvas");
const connectButton = element<HTMLButtonElement>("connect-button");
const settingsButton = element<HTMLButtonElement>("settings-button");
const clearButton = element<HTMLButtonElement>("clear-button");
const statusPill = element<HTMLSpanElement>("connection-status");
const connectionLabel = element<HTMLSpanElement>("connection-label");
const avatarState = element<HTMLSpanElement>("avatar-state");
const messages = element<HTMLDivElement>("messages");
const composer = element<HTMLFormElement>("composer");
const messageInput = element<HTMLTextAreaElement>("message-input");
const sendButton = element<HTMLButtonElement>("send-button");
const micButton = element<HTMLButtonElement>("mic-button");
const settingsDialog = element<HTMLDialogElement>("settings-dialog");
const settingsForm = element<HTMLFormElement>("settings-form");
const apiUrlInput = element<HTMLInputElement>("api-url-input");
const accessTokenInput = element<HTMLInputElement>("access-token-input");
const avatarUrlInput = element<HTMLInputElement>("avatar-url-input");
const cancelSettings = element<HTMLButtonElement>("cancel-settings");

const avatar = new AvatarStage(canvas);
let config = loadConfig();
let client: RealtimeClient | null = null;
let muted = false;
let streamingAssistantMessage: HTMLElement | null = null;

function updateStatus(state: ConnectionState, label: string): void {
  statusPill.dataset.state = state;
  connectionLabel.textContent = label;
  avatarState.textContent = state;
  const connected = state === "connected";
  const busy = state === "connecting";
  connectButton.textContent = connected ? "Disconnect" : busy ? "Connecting…" : "Connect";
  connectButton.disabled = busy;
  messageInput.disabled = !connected;
  sendButton.disabled = !connected;
  micButton.disabled = !connected;
}

function scrollMessages(): void {
  messages.scrollTo({ top: messages.scrollHeight, behavior: "smooth" });
}

function addMessage(role: "user" | "assistant" | "system" | "tool", text: string): HTMLElement {
  const article = document.createElement("article");
  article.className = `message message-${role}`;
  const label = document.createElement("span");
  label.className = "message-role";
  label.textContent = role;
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  article.append(label, paragraph);
  messages.append(article);
  scrollMessages();
  return article;
}

function updateTranscript(role: "user" | "assistant", text: string, final: boolean): void {
  if (role === "user") {
    addMessage("user", text);
    return;
  }
  const safeText = sanitizeAssistantTranscript(text);
  if (!safeText && !final) return;
  if (!streamingAssistantMessage) streamingAssistantMessage = addMessage("assistant", safeText || "…");
  const paragraph = streamingAssistantMessage.querySelector("p");
  if (paragraph) paragraph.textContent = safeText || "…";
  if (final) streamingAssistantMessage = null;
  scrollMessages();
}

function createClient(): RealtimeClient {
  const backend = new BackendClient(config);
  const tools = new ToolRouter(backend, avatar);
  return new RealtimeClient(backend, tools, {
    onStatus: updateStatus,
    onTranscript: updateTranscript,
    onRemoteStream: (stream) => avatar.attachAudioStream(stream),
    onTool: (name, state) => {
      if (state === "running") addMessage("tool", `Running ${name}`);
      if (state === "error") addMessage("system", `${name} could not be completed.`);
    },
    onError: (error) => addMessage("system", error.message),
  });
}

async function connect(): Promise<void> {
  if (client?.connected) {
    await client.disconnect();
    client = null;
    return;
  }
  client = createClient();
  try {
    await client.connect();
    addMessage("system", "Realtime session connected.");
  } catch {
    client = null;
  }
}

function openSettings(): void {
  apiUrlInput.value = config.apiUrl;
  accessTokenInput.value = config.accessToken;
  avatarUrlInput.value = config.avatarUrl;
  settingsDialog.showModal();
}

connectButton.addEventListener("click", () => void connect());
settingsButton.addEventListener("click", openSettings);
cancelSettings.addEventListener("click", () => settingsDialog.close());
clearButton.addEventListener("click", () => {
  messages.replaceChildren();
  streamingAssistantMessage = null;
  addMessage("system", client?.connected ? "Conversation display cleared." : "Configure your PyRealtime API, then connect to begin.");
});

settingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const nextConfig: AppConfig = {
    apiUrl: apiUrlInput.value,
    accessToken: accessTokenInput.value,
    avatarUrl: avatarUrlInput.value,
  };
  config = saveConfig(nextConfig);
  settingsDialog.close();
  void avatar.load(config.avatarUrl).catch((error) => {
    addMessage("system", `Avatar model failed to load; using the built-in avatar. ${String(error)}`);
    void avatar.load("");
  });
});

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !client?.connected) return;
  addMessage("user", text);
  client.sendText(text);
  messageInput.value = "";
  messageInput.style.height = "auto";
});

messageInput.addEventListener("input", () => {
  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 130)}px`;
});
messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    composer.requestSubmit();
  }
});

micButton.addEventListener("click", () => {
  muted = !muted;
  client?.setMicrophoneMuted(muted);
  micButton.dataset.muted = String(muted);
  micButton.textContent = muted ? "Mic off" : "Mic on";
});

window.addEventListener("beforeunload", () => void client?.disconnect());
void avatar.load(config.avatarUrl).catch(() => avatar.load(""));
updateStatus("idle", "Ready");

if (!localStorage.getItem("pyrealtime-web-config")) openSettings();
