# Architecture boundary

This repository contains a reusable browser transport/tool SDK plus a reference UI. It is not the owner of reusable server-side application processing.

| PyRealtime library/API | This frontend |
| --- | --- |
| Authentication, session creation, backend tools | WebRTC, microphone, audio playback |
| File validation, extraction, compression, limits, and chunking | File picker, preview, upload progress |
| Stable prepared-attachment contract | Sending prepared content as Realtime client events |
| Reusable policy and business rules | SDK: WebRTC/event transport; demo: DOM, Three.js avatar, local animation tools |

For new features, first ask whether they are server policy/processing, reusable browser protocol, or demo UI. Put them respectively in PyRealtime, `src/client` plus its transport modules, or `src/main.ts`/UI modules. Browser validation may improve UX, but PyRealtime remains authoritative.
