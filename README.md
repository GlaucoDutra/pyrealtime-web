# PyRealtime Web

A public reference frontend for [PyRealtime](https://github.com/GlaucoDutra/pyrealtime). It demonstrates a complete browser-side OpenAI Realtime integration without exposing a standard OpenAI API key.

## What it includes

- WebRTC audio sessions created through the PyRealtime backend
- Live user and assistant transcripts
- Text and microphone input
- Structured Realtime function-call handling
- Secure forwarding of application tools to `POST /v1/tools/{tool_name}`
- Local `get_available_animations` and `play_avatar_animation` tools
- Chat attachments with image compression and text extraction
- A smooth antialiased Three.js avatar canvas with optional GLB loading
- A procedural fallback avatar, embedded gestures, and audio-reactive animation
- Session-only access-token storage
- Responsive desktop and mobile layouts

## Architecture

```text
Browser
  ├─ microphone, remote audio, transcript, Three.js avatar
  ├─ POST /v1/realtime/session with an SDP offer
  └─ receives structured function calls over the WebRTC data channel
                    │
                    ▼
PyRealtime API
  ├─ keeps OPENAI_API_KEY on the server
  ├─ creates the OpenAI Realtime call
  ├─ authenticates the application user
  └─ executes registered backend tools
```

Avatar tools execute locally because the avatar exists in the browser. Every other function call is forwarded to the PyRealtime backend. Function results are returned to the model as `function_call_output` events.

`play_avatar_animation` deliberately does not create a second model response. This prevents unwanted narration such as “the animation was completed.” The frontend also filters common textual imitations of animation calls from the visible transcript as a defensive fallback.

## Requirements

- Node.js 20 or newer
- A running [PyRealtime](https://github.com/GlaucoDutra/pyrealtime) API
- HTTPS in production (browsers require a secure context for microphone access)

## Run locally

### One-click Windows prototype

Clone `pyrealtime` and `pyrealtime-web` as sibling directories, then double-click `run-local.cmd` or run:

```powershell
.\scripts\run-local.ps1
```

The launcher securely prompts for `OPENAI_API_KEY`, creates an isolated Python environment, starts both services on `127.0.0.1`, and opens the frontend. The key remains only in the local backend process environment. Press Enter in the launcher window to stop both services.

The prototype includes backend tools for local time, exact arithmetic, remembering notes, and listing notes, plus local avatar animation tools.

### Manual development

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env` if you want a default API URL:

```env
VITE_APP_BASE_URL=http://127.0.0.1:8000
VITE_AVATAR_MODEL_URL=
```

Then open `http://127.0.0.1:5173`. The settings dialog accepts:

- Your PyRealtime API base URL
- A user JWT or, for local testing, `APP_API_KEY`
- An optional CORS-accessible GLB avatar URL

The access token is stored only in `sessionStorage`. Do not put a production `APP_API_KEY`, OpenAI API key, database credential, or administrative token in a Vite environment variable: `VITE_*` values are public after build.

## Avatar GLB files

Open settings and either choose a local `.glb` file or enter a public GLB URL. Local files are validated, loaded, and saved in the browser's IndexedDB, so they remain selected after a reload without being uploaded to the backend. The current limit is 50 MB.

Remote URLs are loaded directly by the browser and therefore require CORS permission from the file host. If a remote model is blocked or invalid, the settings dialog remains open and displays the loading error. Use the local file option when a CDN does not provide the required CORS headers.

## Chat attachments

The chat composer accepts one attachment at a time and follows the same processing structure as the original plugin:

- PNG, JPEG, GIF, and WebP images are resized and compressed before being sent as `input_image` content.
- TXT, Markdown, CSV, JSON, JavaScript, TypeScript, HTML, CSS, and XML are decoded in the browser.
- PDFs are parsed page-by-page for selectable text.
- XLSX and XLSM spreadsheets are converted to tab-separated text.
- Legacy spreadsheets, Word files, PowerPoint files, and unknown formats send a preprocessing notice instead of pretending their contents were read.

Extracted text is capped at 120,000 characters, split into 8,000-character conversation items, and sent with data-channel backpressure. Files are limited to 25 MB. File contents stay in the browser and Realtime session; they are not stored by the PyRealtime backend.

On desktop, the application shell remains fixed to the viewport and only the conversation history scrolls. Mobile layouts retain normal page scrolling while keeping the conversation history independently scrollable.

## Backend configuration

For local development, configure the Python API with:

```env
OPENAI_API_KEY=sk-your-server-key
APP_API_KEY=local-development-secret
APP_CORS_ORIGINS=http://127.0.0.1:5173
```

Run the example backend from the PyRealtime repository:

```bash
python -m pip install -e ".[api]"
uvicorn examples.api_server:app --reload
```

For a public deployment, replace the shared `APP_API_KEY` with PyRealtime's custom `authenticate` callback and validate short-lived user sessions or JWTs.

## Tool-call flow

1. The backend creates a Realtime session containing its registered tool schemas.
2. The frontend preserves those schemas and adds the two avatar tools.
3. OpenAI emits a structured function call through the WebRTC data channel.
4. The frontend assembles streamed arguments by `call_id`.
5. Avatar functions run locally; other functions are posted to PyRealtime.
6. The frontend sends the result back as `function_call_output`.
7. Backend tool calls continue the assistant response. Avatar playback stays nonverbal.

## Commands

```bash
npm run dev       # development server
npm run build     # type-check and production build
npm test          # unit tests
npm run preview   # preview the production build
```

## Security boundary

The browser is untrusted. It may request an action, but the backend must authenticate the user and enforce ownership and authorization. Tool arguments generated by a model are input—not proof that an action is allowed.

No license has been selected yet. Public visibility alone does not grant reuse rights.
