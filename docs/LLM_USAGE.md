# PyRealtime Web complete usage guide

This document is the canonical operating guide for humans and language models that need to run, understand, customize, embed, or troubleshoot the PyRealtime reference frontend.

## 1. What this repository is

PyRealtime Web is a public browser reference client for the [PyRealtime Python backend](https://github.com/GlaucoDutra/pyrealtime).

It demonstrates:

- OpenAI Realtime audio through browser WebRTC.
- Live text and audio transcripts.
- Text messages and microphone input.
- Microphone selection and live switching.
- Structured function-call handling.
- Backend tools executed through PyRealtime.
- Browser-local navigation and avatar tools.
- Server-prepared file attachments.
- Three.js avatar rendering with local or remote GLB models.
- Generated-image display.
- Progressive search/tool activity feedback.

It is a reference application, not currently a published npm SDK.

## 2. Architecture boundary

This repository owns browser-only behavior:

- DOM and UI.
- Microphone permissions and media devices.
- Browser WebRTC peer connection.
- Realtime data-channel event dispatch.
- Remote audio playback.
- Three.js rendering and avatar animation.
- Local browser actions.
- Session-only storage of the application access token.

The Python repository owns reusable behavior:

- OpenAI credentials.
- Session configuration and creation.
- Authentication and authorization.
- Backend tools and business logic.
- Web search, file search, image generation, and single backend model calls.
- File validation, extraction, compression, and chunking.

Never move standard OpenAI keys, database credentials, administrative tokens, authorization decisions, or private vector store selection into this repository.

## 3. Repository map

| Path | Purpose |
| --- | --- |
| `src/main.ts` | UI wiring and application lifecycle |
| `src/backend-client.ts` | HTTP client for PyRealtime endpoints |
| `src/realtime-client.ts` | WebRTC and Realtime event protocol |
| `src/tool-router.ts` | Local tool execution and backend forwarding |
| `src/tool-feedback.ts` | User-visible progressive tool states |
| `src/avatar-stage.ts` | Three.js avatar loading, rendering, and gestures |
| `src/avatar-storage.ts` | IndexedDB persistence for local GLB files |
| `src/file-processing.ts` | Browser-side attachment selection contract |
| `src/transcript.ts` | Defensive filtering of textual avatar-tool imitations |
| `scripts/run-local.ps1` | Complete Windows prototype launcher |
| `index.html` | Application markup |

Follow `ARCHITECTURE.md` before deciding where a new feature belongs.

## 4. Fastest Windows setup

Clone the backend and frontend as siblings:

```text
parent-directory/
  pyrealtime/
  pyrealtime-web/
```

```powershell
git clone https://github.com/GlaucoDutra/pyrealtime.git
git clone https://github.com/GlaucoDutra/pyrealtime-web.git
cd pyrealtime-web
.\scripts\run-local.ps1
```

You may also double-click `run-local.cmd`.

The launcher prompts for `OPENAI_API_KEY`, installs an isolated local backend, starts ports 8000 and 5173, and opens the browser. The key remains in the backend process environment.

Press Enter in the launcher window to stop the services it owns.

## 5. Manual full-stack setup

### Backend

Follow the backend repository's `docs/LLM_USAGE.md`. A minimal PowerShell run is:

```powershell
cd ..\pyrealtime
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[api,files]"
$env:OPENAI_API_KEY = "sk-your-server-key"
$env:APP_API_KEY = "local-development-token"
$env:APP_CORS_ORIGINS = "http://127.0.0.1:5173"
python -m uvicorn examples.prototype_server:app --host 127.0.0.1 --port 8000
```

### Frontend

In another terminal:

```bash
cd pyrealtime-web
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

Open `http://127.0.0.1:5173`.

In the settings dialog enter:

- API URL: `http://127.0.0.1:8000`
- Access token: `local-development-token`
- Optional avatar: a local `.glb` file or CORS-accessible GLB URL

Then save settings and select **Connect**.

## 6. Frontend environment variables

Copy `.env.example` to `.env` when defaults are useful:

```env
VITE_APP_BASE_URL=http://127.0.0.1:8000
VITE_AVATAR_MODEL_URL=
```

| Variable | Meaning |
| --- | --- |
| `VITE_APP_BASE_URL` | Default public origin of the PyRealtime application API |
| `VITE_AVATAR_MODEL_URL` | Optional default CORS-accessible GLB URL |

All `VITE_*` values are compiled into public browser code. Never put `OPENAI_API_KEY`, database credentials, private service tokens, or an administrative `APP_API_KEY` into a Vite variable.

## 7. Browser settings and storage

The settings dialog accepts:

- PyRealtime API URL.
- Application access token or user JWT.
- Local GLB file.
- Remote GLB URL.

Storage behavior:

- API URL, avatar URL, and microphone ID are persisted in browser storage.
- The access token is stored only in `sessionStorage` and disappears when that browser tab/session ends.
- A selected local GLB is stored in IndexedDB and is never uploaded to PyRealtime.
- Local GLBs are limited to 50 MB.

The frontend access token authenticates to your application backend. It is not the OpenAI API key.

## 8. Connection sequence

The reference client uses PyRealtime's unified WebRTC session endpoint:

1. Request microphone access with echo cancellation, noise suppression, and automatic gain control.
2. Create `RTCPeerConnection`.
3. Add the selected microphone track.
4. Create the `oai-events` data channel.
5. Create and set the local SDP offer.
6. POST the SDP body to `POST /v1/realtime/session`.
7. Set the returned SDP answer as the remote description.
8. Wait for the data channel to open.
9. Attach the remote OpenAI audio stream to an autoplay audio element and avatar analyser.

The standard OpenAI key never reaches the browser. The unified WebRTC architecture follows the official [OpenAI WebRTC guide](https://developers.openai.com/api/docs/guides/voice-webrtc).

## 9. Backend HTTP calls

`BackendClient` calls:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/v1/realtime/session` | Exchange browser SDP for OpenAI SDP |
| `POST` | `/v1/tools/{tool_name}` | Execute a registered backend tool |
| `POST` | `/v1/files/prepare` | Upload and normalize/extract a chat attachment |

Protected calls send:

```http
Authorization: Bearer <frontend access token>
```

The backend README and `docs/LLM_USAGE.md` define the complete endpoint contract.

## 10. Text messages

`RealtimeClient.sendText()` sends:

```json
{
  "type": "conversation.item.create",
  "item": {
    "type": "message",
    "role": "user",
    "content": [{"type": "input_text", "text": "User message"}]
  }
}
```

It then sends `response.create`.

Do not call `response.create` a second time for the same user action unless another model turn is genuinely required.

## 11. Tool-call flow

1. PyRealtime includes registered backend function schemas in the Realtime session.
2. The browser adds `navigate_to_url`, `get_available_animations`, and `play_avatar_animation`.
3. Realtime emits a structured function-call output item.
4. `ToolCallAccumulator` assembles streamed JSON arguments by `call_id`.
5. `ToolRouter` executes browser-local tools or forwards the arguments to `/v1/tools/{tool_name}`.
6. The frontend sends `conversation.item.create` with `type: function_call_output`.
7. It sends `response.create` only when the tool result requires another model response.

Current local tools:

| Tool | Runs in | Continuation behavior |
| --- | --- | --- |
| `navigate_to_url` | Browser | No follow-up narration after success |
| `get_available_animations` | Browser | Model may continue with an animation choice |
| `play_avatar_animation` | Browser | No follow-up narration |

All other function names are forwarded to PyRealtime.

Avatar tools must be emitted as real structured function calls. The assistant must never print function syntax, stage directions, or statements announcing or confirming an animation.

## 12. Server tools visible to the frontend

The example backend registers:

- `web_search`
- `backend_openai_call`
- `generate_image`
- `file_search` when vector stores are configured
- `get_local_time`
- `calculate`
- `remember_note`
- `list_notes`

`backend_openai_call` is a single server-side model call, separate from Realtime.

Generated images return a data URI. `ToolRouter` displays that image locally and removes the large base64 value before returning the function result to the Realtime data channel.

Web search results may contain citations. When adding rich search rendering, source citations must remain visible and clickable, consistent with the official [OpenAI web search guide](https://developers.openai.com/api/docs/guides/tools-web-search).

## 13. Progressive tool feedback

`tool-feedback.ts` maps tool lifecycle events to human-readable states.

For web search:

- Initial: `Searching the web…`
- After 7 seconds: `Reading and comparing sources…`
- After 20 seconds: `Still searching — some pages take longer to read…`
- Success: `Web search complete.`
- Timeout: visible retry guidance

The same lifecycle pattern covers file search and image generation. Update the existing status card rather than appending repeated progress messages.

## 14. File attachments

The composer accepts one file at a time.

Flow:

1. The browser validates basic selection constraints.
2. It uploads raw bytes to `/v1/files/prepare` with `Content-Type` and URL-encoded `X-Filename`.
3. PyRealtime performs authoritative validation and extraction.
4. Images are sent as `input_image` content.
5. Extracted text is sent as ordered conversation chunks.
6. The model response is created only after the final `[END OF FILE]` message.

Supported preparation includes common images, text/source files, PDF, XLSX/XLSM, DOCX, and PPTX. The backend owns the exact limits and format policy.

The browser uses data-channel backpressure and rejects oversized individual events. Do not send a large file or generated-image base64 payload directly over the Realtime channel.

## 15. Avatar operation

The frontend supports:

- A built-in procedural avatar.
- Local GLB loading from IndexedDB.
- Remote GLB loading when CORS permits it.
- Embedded GLB animation clips.
- Procedural `yes`, `no`, `wave`, `thinking`, and `celebrate` gestures.
- Audio-reactive movement for the procedural mouth.
- Antialiasing, capped device pixel ratio, ACES tone mapping, and responsive resize.

Animation names are matched exactly first, then partially. `play_avatar_animation` returns to idle by default and deliberately suppresses an extra assistant turn.

Known avatar limitations:

- Loaded GLBs do not yet use viseme/jaw morph targets for lip sync.
- Runtime rotation and hide/show controls are not exposed.
- External FBX animation loading is not supported.
- Advanced playback speed, crossfade, interrupt, and hold-last-frame controls are not exposed.

## 16. Microphone operation

- The selected microphone ID is persisted.
- Changing selection during a session replaces the active WebRTC sender track without reconnecting.
- If a saved device disappears, the frontend falls back to the default microphone.
- The mic button enables or disables the local audio track.
- Device changes refresh the selector.

Current limitation: connection always requests microphone permission. A text-only connection mode is not yet implemented.

## 17. Transcript behavior

The client handles completed user audio transcription and streamed/final assistant audio or text transcription.

`transcript.ts` removes common textual imitations of avatar function calls and narration such as announcing or confirming an animation. This is defensive UI filtering; correct Realtime instructions and structured tool use remain the primary behavior.

Current limitation: partial user transcription and response usage/cost accounting are not yet surfaced.

## 18. Customization rules

When adding a feature, ask whether another web, mobile, desktop, or headless client could reuse it.

Put it in PyRealtime when it involves:

- Authentication or authorization.
- Database or private service access.
- Tool schema ownership and business rules.
- File extraction or limits.
- OpenAI standard keys.
- Search, retrieval, model calls, or image generation.
- Stable transport-neutral data models.

Put it in this frontend when it involves:

- DOM and visual design.
- Browser storage.
- Microphone and audio elements.
- WebRTC client events.
- Three.js rendering.
- File pickers and upload progress.
- Browser navigation or another device-local effect.

Cheap validation may exist in both places for immediate UX, but the server remains authoritative.

## 19. Production deployment checklist

- Build with `npm run build`.
- Serve `dist/` over HTTPS.
- Configure the deployed origin in backend `APP_CORS_ORIGINS`.
- Set `VITE_APP_BASE_URL` to the public HTTPS application API before building.
- Use short-lived user JWTs or sessions in the frontend.
- Never compile a shared production `APP_API_KEY` into the bundle.
- Keep the standard OpenAI key on the backend.
- Confirm microphone permissions and autoplay behavior in target browsers.
- Confirm GLB hosts send appropriate CORS headers.
- Add a Content Security Policy suitable for the chosen deployment and asset hosts.
- Preserve clickable web-search citations.
- Run `npm test` and `npm run build`.
- Select a repository license before inviting third-party reuse.

## 20. Troubleshooting

### `Session request failed (401)`

The frontend access token is missing or rejected by the application backend. It must match `APP_API_KEY` in development or be a valid user token for the custom authenticator.

### `Session request failed (502)`

PyRealtime reached OpenAI but OpenAI rejected the key, model, project permissions, quota, or session configuration. Read the backend response detail and logs.

### Port 8000 is already in use

The launcher only stops a listener it can identify as belonging to this project. Stop the unrelated process or choose another backend port and API URL.

### Microphone permission denied

Grant microphone permission for the frontend origin and reconnect. Text-only connection is not currently available.

### Microphone list has no names

Browsers may hide device labels until permission has been granted. Connect once, then refresh device selection.

### GLB will not load

Prefer the local file picker. For a remote URL, confirm it is a valid `.glb`, uses HTTP(S), and returns browser-compatible CORS headers.

### Navigation opened but assistant said it was blocked

Use a current build. The frontend now distinguishes a genuine popup block and suppresses redundant narration after successful navigation.

### Web search takes time

The UI reports search phases. The backend default hosted-tool timeout is 120 seconds. Restart the backend and reconnect after changing tool configuration.

### `file_search` is unavailable

Set backend `PYREALTIME_VECTOR_STORE_IDS`, restart the backend, then reconnect so the new tool schema is loaded.

## 21. Commands and verification

```bash
npm install
npm test
npm run build
npm run dev
npm run preview
```

An LLM making changes must:

1. Read `instructions.md`, this guide, and `ARCHITECTURE.md`.
2. Inspect the backend guide when changing an HTTP or tool contract.
3. Keep reusable processing in PyRealtime.
4. Add or update tests.
5. Run `npm test` and `npm run build`.
6. Update this guide when public UI behavior, configuration, tool flow, storage, or setup changes.

## 22. Known limitations

- This project is a reference application, not a published npm library.
- It currently requires microphone permission to connect.
- It does not expose assistant-audio mute separately from microphone mute.
- It does not expose runtime model, voice, VAD, or instruction controls.
- It does not expose response usage or cost accounting.
- Local frontend tool registration is not yet a public extension API.
- The repository does not currently declare a reuse license.

