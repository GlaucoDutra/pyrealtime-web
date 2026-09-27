# Compatibility and dependency policy

- Supported runtime: current evergreen browsers with WebRTC/data-channel support. Build and release jobs use Node.js 22; local development supports Node.js 20 or newer.
- Releases use Semantic Versioning. Exported SDK types and methods documented in `docs/LLM_USAGE.md` are stable within a major version.
- Browser UI markup and visual design belong to the reference app and are not part of the SDK compatibility contract.
- Runtime and development dependencies use bounded major versions through `package-lock.json`. Dependabot proposes weekly npm and GitHub Actions updates; tests, app build, SDK build, and package dry-run gate merges.
- OpenAI Realtime events may add fields. The client ignores unknown events; breaking protocol adaptations are released with migration notes.
