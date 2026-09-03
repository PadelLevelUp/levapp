---
path: frontend/apps/web/public/sw.js
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 47
size_tokens: 323
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "17af51f18ad27908a5d84306e028e358fba6c4d6be32a571be1a3b52289afa1a"
---

## Purpose

The web app's push-only service worker. Handles two events: `push` — parses the payload as JSON (swallowing parse errors), then shows a `Notification` with a title/body/icon and stashes a target `url` in `notification.data`; and `notificationclick` — closes the notification and either focuses+navigates an existing window client to that URL or opens a new one. A header comment records the Phase-1 audit context: live message updates arrive via SSE (`/api/app/events`) while the app is open, no service worker registration existed before this, and the auth token lives in localStorage sent as a Bearer header. This file is served as a static asset at `/sw.js`, not bundled by Vite.

## Connections

Uses: browser Push API / Notifications API / Clients API globals only — no imports.

Used by: registered from `frontend/apps/web/src/main.tsx` (`navigator.serviceWorker.register("/sw.js")`) and from `pushNotifications.ts`'s `getOrRegisterServiceWorker`; the push subscription flow (`requestAndSubscribe`/`subscribeToPush` in `src/utils/pushNotifications.ts`) is what causes the browser to invoke this worker's `push` handler.
