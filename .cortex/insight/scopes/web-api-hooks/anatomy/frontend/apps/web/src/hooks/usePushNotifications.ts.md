---
path: frontend/apps/web/src/hooks/usePushNotifications.ts
extracted_at: 2026-09-03T14:14:29Z
extraction_level: 2
size_lines: 78
size_tokens: 594
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d54dc22aea7f64e52c7d99d32b742906448497a4daabd899d0fed64edf06d35f"
---

## Purpose

`usePushNotifications(token)` — the web Push API subscription lifecycle hook: feature-detects support (`Notification`/`serviceWorker`/`PushManager` on `window`), tracks permission state and current subscription state (via `navigator.serviceWorker.getRegistration()` + `pushManager.getSubscription()`), and exposes `subscribe()`/`unsubscribe()` that call into `@/utils/pushNotifications`'s `subscribeToPush`/`unsubscribeFromPush` (outside this scope) with the caller-supplied JWT `token`. Its header comment documents the audit findings that motivated it: the messaging page already used SSE for the open-app case, so push exists to cover closed-app notification delivery, and there was no prior subscription hook or service-worker flow to build on. Web-only — the Web Push API (`PushManager`, service workers) has no direct equivalent in the React Native/iOS scope; mobile push uses Expo's native push token flow instead.

## Connections

Uses: `@/utils/pushNotifications` (outside scope) — `subscribeToPush`, `unsubscribeFromPush`; `react`.

Used by: no file within this scope (its consumer is whatever surface offers the "enable notifications" toggle, outside `api/`/`hooks/`/`data/`).
