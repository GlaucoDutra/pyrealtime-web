# Architecture boundary

This repository is a reference browser adapter for PyRealtime, not the owner of reusable application processing.

| PyRealtime library/API | This frontend |
| --- | --- |
| Authentication, session creation, backend tools | WebRTC, microphone, audio playback |
| File validation, extraction, compression, limits, and chunking | File picker, preview, upload progress |
| Stable prepared-attachment contract | Sending prepared content as Realtime client events |
| Reusable policy and business rules | DOM, Three.js avatar, local animation tools |

For new features, first ask whether another web, desktop, or mobile client could reuse the logic. If yes, implement it in PyRealtime and expose a small client adapter here. Browser validation may improve UX, but PyRealtime remains authoritative.
