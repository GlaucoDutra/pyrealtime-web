# Instructions for humans and coding agents

Before running, integrating, or changing this frontend, read the canonical [complete usage guide](docs/LLM_USAGE.md).

Also follow [ARCHITECTURE.md](ARCHITECTURE.md). This repository owns browser UI, microphone and media-device handling, WebRTC client integration, browser storage, rendering, and device-local actions. Reusable processing, credentials, authentication, authorization, file extraction, backend tools, and business policy belong in [PyRealtime](https://github.com/GlaucoDutra/pyrealtime).

When public behavior changes, update `docs/LLM_USAGE.md`, automated tests, and the backend contract documentation when applicable.

