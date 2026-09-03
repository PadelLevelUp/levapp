---
path: frontend/apps/web/src/utils/pushNotifications.ts
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 115
size_tokens: 847
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "79bb2be5aada8642b28cfcb9b8f55d62ccb5c59b44a9a1a6518e7d60cc94f408"
---

## Purpose

Web Push subscription lifecycle: fetches the VAPID public key from the backend, registers/reuses the `public/sw.js` service worker, subscribes/unsubscribes the browser's `PushManager`, and POSTs/DELETEs the subscription to the backend (`/api/notifications/*`) with the JWT as a Bearer header. `requestAndSubscribe(token)` is the safe entry point other code calls — it feature-detects `Notification`/`serviceWorker`/`PushManager` support, respects an already-`"denied"` permission, prompts only if permission is undecided, and swallows all errors so a push-subscription failure never breaks the login/session-restore flow that calls it. A header comment records Phase-1 audit context: live message updates come via SSE while the app is open, the token lives in localStorage, and backend routes already follow `/api/*` conventions.

## Connections

Uses: browser Push/Notification/ServiceWorker APIs (no imports); calls `fetch` directly against `/api/notifications/vapid-public-key`, `/api/notifications/save-subscription`, `/api/notifications/unsubscribe` rather than going through a shared API client.

Used by: `frontend/apps/web/src/auth/AuthContext.tsx` (`requestAndSubscribe` on silent restore and on login, both outside mock-data mode).
