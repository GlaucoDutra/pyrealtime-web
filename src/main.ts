import "./style.css";
import { AvatarStage } from "./avatar-stage";
import {
  getSavedAvatar,
  removeSavedAvatar,
  saveAvatarFile,
  validateAvatarFile,
  withAvatarObjectUrl,
} from "./avatar-storage";
import { BackendClient } from "./backend-client";
import { loadConfig, saveConfig, type AppConfig } from "./config";
import { formatFileSize } from "./file-processing";
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
const microphoneSelect = element<HTMLSelectElement>("microphone-select");
const attachButton = element<HTMLButtonElement>("attach-button");
const chatFileInput = element<HTMLInputElement>("chat-file-input");
const attachmentPreview = element<HTMLDivElement>("attachment-preview");
const attachmentName = element<HTMLElement>("attachment-name");
const attachmentMeta = element<HTMLElement>("attachment-meta");
const removeAttachment = element<HTMLButtonElement>("remove-attachment");
const settingsDialog = element<HTMLDialogElement>("settings-dialog");
const settingsForm = element<HTMLFormElement>("settings-form");
const apiUrlInput = element<HTMLInputElement>("api-url-input");
const accessTokenInput = element<HTMLInputElement>("access-token-input");
const avatarUrlInput = element<HTMLInputElement>("avatar-url-input");
const avatarFileInput = element<HTMLInputElement>("avatar-file-input");
const avatarFileStatus = element<HTMLElement>("avatar-file-status");
const settingsError = element<HTMLParagraphElement>("settings-error");
const saveSettings = element<HTMLButtonElement>("save-settings");
const clearAvatar = element<HTMLButtonElement>("clear-avatar");
const cancelSettings = element<HTMLButtonElement>("cancel-settings");

const avatar = new AvatarStage(canvas);
let config = loadConfig();
let client: RealtimeClient | null = null;
let muted = false;
let streamingAssistantMessage: HTMLElement | null = null;
let hasSavedAvatar = false;
let pendingFile: File | null = null;
let sendingFile = false;

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
  microphoneSelect.disabled = busy;
  attachButton.disabled = !connected;
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

function addGeneratedImage(dataUrl: string, description: string): void {
  const article = document.createElement("article");
  article.className = "message message-tool generated-image-message";
  const label = document.createElement("span");
  label.className = "message-role";
  label.textContent = "Generated image";
  const image = document.createElement("img");
  image.className = "generated-image";
  image.src = dataUrl;
  image.alt = description || "Generated image";
  article.append(label, image);
  messages.append(article);
  scrollMessages();
}

function setPendingFile(file: File | null): void {
  pendingFile = file;
  attachmentPreview.hidden = file === null;
  attachmentName.textContent = file?.name ?? "";
  attachmentMeta.textContent = file ? `${formatFileSize(file.size)} · ready to send` : "";
  if (!file) chatFileInput.value = "";
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
  const tools = new ToolRouter(backend, avatar, { onGeneratedImage: addGeneratedImage });
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

async function refreshMicrophones(): Promise<boolean> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    microphoneSelect.replaceChildren(new Option("Microphone selection unavailable", ""));
    microphoneSelect.disabled = true;
    return false;
  }
  const inputs = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "audioinput");
  const selectedExists = !config.microphoneId || inputs.some((device) => device.deviceId === config.microphoneId);
  if (!selectedExists) config = saveConfig({ ...config, microphoneId: "" });
  const options = [new Option("Default microphone", "")];
  inputs.forEach((device, index) => {
    options.push(new Option(device.label || `Microphone ${index + 1}`, device.deviceId));
  });
  microphoneSelect.replaceChildren(...options);
  microphoneSelect.value = config.microphoneId;
  microphoneSelect.disabled = false;
  return selectedExists;
}

async function connect(): Promise<void> {
  if (client?.connected) {
    await client.disconnect();
    client = null;
    return;
  }
  client = createClient();
  try {
    await client.connect(config.microphoneId);
    client.setMicrophoneMuted(muted);
    await refreshMicrophones();
    addMessage("system", "Realtime session connected.");
  } catch {
    client = null;
  }
}

function formatBytes(value: number): string {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function showSettingsError(error: unknown): void {
  settingsError.textContent = error instanceof Error ? error.message : String(error);
  settingsError.hidden = false;
}

async function refreshAvatarFileStatus(): Promise<void> {
  const stored = await getSavedAvatar();
  hasSavedAvatar = stored !== null;
  avatarFileStatus.textContent = stored
    ? `Saved: ${stored.name} (${formatBytes(stored.size)}). Choose another file to replace it.`
    : "Stored only in this browser. Maximum size: 50 MB.";
  clearAvatar.hidden = !stored;
}

function openSettings(): void {
  apiUrlInput.value = config.apiUrl;
  accessTokenInput.value = config.accessToken;
  avatarUrlInput.value = config.avatarUrl;
  avatarFileInput.value = "";
  settingsError.hidden = true;
  settingsDialog.showModal();
  void refreshAvatarFileStatus().catch(showSettingsError);
}

connectButton.addEventListener("click", () => void connect());
settingsButton.addEventListener("click", openSettings);
cancelSettings.addEventListener("click", () => settingsDialog.close());
clearAvatar.addEventListener("click", () => {
  void (async () => {
    try {
      await removeSavedAvatar();
      config = saveConfig({ ...config, avatarUrl: "" });
      avatarUrlInput.value = "";
      await avatar.load("");
      await refreshAvatarFileStatus();
      addMessage("system", "Saved avatar removed. Using the built-in avatar.");
    } catch (error) {
      showSettingsError(error);
    }
  })();
});
clearButton.addEventListener("click", () => {
  messages.replaceChildren();
  streamingAssistantMessage = null;
  addMessage("system", client?.connected ? "Conversation display cleared." : "Start the PyRealtime API, then connect to begin.");
});

settingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void (async () => {
    settingsError.hidden = true;
    saveSettings.disabled = true;
    saveSettings.textContent = "Loading…";
    try {
      const file = avatarFileInput.files?.[0];
      const remoteUrl = avatarUrlInput.value.trim();
      let savedAvatarName = "";

      if (file) {
        validateAvatarFile(file);
        const objectUrl = URL.createObjectURL(file);
        try {
          await avatar.load(objectUrl);
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
        const stored = await saveAvatarFile(file);
        savedAvatarName = stored.name;
        await refreshAvatarFileStatus();
      } else if (remoteUrl) {
        const parsed = new URL(remoteUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error("The GLB URL must use http:// or https://.");
        await avatar.load(remoteUrl);
        await removeSavedAvatar();
        hasSavedAvatar = false;
      } else if (!hasSavedAvatar) {
        await avatar.load("");
      }

      const nextConfig: AppConfig = {
        apiUrl: apiUrlInput.value,
        accessToken: accessTokenInput.value,
        avatarUrl: file ? "" : remoteUrl,
        microphoneId: config.microphoneId,
      };
      config = saveConfig(nextConfig);
      settingsDialog.close();
      addMessage("system", savedAvatarName ? `Avatar saved: ${savedAvatarName}` : "Settings saved.");
    } catch (error) {
      showSettingsError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      saveSettings.disabled = false;
      saveSettings.textContent = "Save settings";
    }
  })();
});

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  if ((!text && !pendingFile) || !client?.connected || sendingFile) return;
  if (!pendingFile) {
    addMessage("user", text);
    client.sendText(text);
    messageInput.value = "";
    messageInput.style.height = "auto";
    return;
  }

  const file = pendingFile;
  void (async () => {
    sendingFile = true;
    sendButton.disabled = true;
    attachButton.disabled = true;
    removeAttachment.disabled = true;
    const progressMessage = addMessage("tool", `Preparing ${file.name}…`);
    const progressText = progressMessage.querySelector("p");
    addMessage("user", `${text || "Please analyze this file."}\n📎 ${file.name}`);
    try {
      await client?.sendFile(file, text, (progress) => {
        attachmentMeta.textContent = progress;
        if (progressText) progressText.textContent = progress;
      });
      if (progressText) progressText.textContent = `${file.name} sent`;
      setPendingFile(null);
      messageInput.value = "";
      messageInput.style.height = "auto";
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (progressText) progressText.textContent = `Could not send ${file.name}`;
      attachmentMeta.textContent = detail;
      addMessage("system", detail);
    } finally {
      sendingFile = false;
      sendButton.disabled = !client?.connected;
      attachButton.disabled = !client?.connected;
      removeAttachment.disabled = false;
    }
  })();
});

attachButton.addEventListener("click", () => chatFileInput.click());
chatFileInput.addEventListener("change", () => {
  const file = chatFileInput.files?.[0] ?? null;
  setPendingFile(file);
});
removeAttachment.addEventListener("click", () => setPendingFile(null));

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

microphoneSelect.addEventListener("change", () => {
  const previousId = config.microphoneId;
  const nextId = microphoneSelect.value;
  config = saveConfig({ ...config, microphoneId: nextId });
  if (!client?.connected) return;
  microphoneSelect.disabled = true;
  void client.switchMicrophone(nextId).then(() => {
    const name = microphoneSelect.selectedOptions[0]?.textContent || "Default microphone";
    addMessage("system", `Microphone changed to ${name}.`);
  }).catch((error) => {
    config = saveConfig({ ...config, microphoneId: previousId });
    microphoneSelect.value = previousId;
    addMessage("system", `Could not switch microphone. ${error instanceof Error ? error.message : String(error)}`);
  }).finally(() => {
    microphoneSelect.disabled = false;
  });
});

navigator.mediaDevices?.addEventListener("devicechange", () => {
  const previousId = config.microphoneId;
  void refreshMicrophones().then((selectedStillExists) => {
    if (!selectedStillExists && previousId && client?.connected) {
      return client.switchMicrophone("").then(() => addMessage("system", "The selected microphone was removed. Using the default microphone."));
    }
    return undefined;
  }).catch((error) => addMessage("system", `Could not refresh microphones. ${error instanceof Error ? error.message : String(error)}`));
});

window.addEventListener("beforeunload", () => void client?.disconnect());
void (async () => {
  try {
    const stored = await getSavedAvatar();
    hasSavedAvatar = stored !== null;
    if (stored) await withAvatarObjectUrl(stored, (url) => avatar.load(url));
    else await avatar.load(config.avatarUrl);
  } catch (error) {
    addMessage("system", `Saved avatar could not be loaded. ${error instanceof Error ? error.message : String(error)}`);
    await avatar.load("");
  }
})();
updateStatus("idle", "Ready");
void refreshMicrophones().catch(() => undefined);
