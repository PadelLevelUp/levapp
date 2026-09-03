---
path: frontend/apps/mobile/src/hooks/usePushNotificationRouting.ts
extracted_at: 2026-09-03T14:11:46Z
extraction_level: 2
size_lines: 85
size_tokens: 687
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "9fea6b3a5014ca451bca0b3037083031ad11b4aaa9ee57cd802f88f142c32350"
---

## Purpose

Wires a tapped push notification to in-app navigation: maps a notification's `data` payload (`type: "message"` → `/conversation/[id]`, `type: "class"` → `/class/[id]`) via `routeForData`, and handles both a live tap while the app is running (`addNotificationResponseReceivedListener`) and a cold start launched BY tapping a notification (`getLastNotificationResponseAsync` on mount). Also sets the module-level foreground notification display policy (show banner + list, no sound/badge) as a side effect on import.

## Connections

Uses: none within scope (imports `expo-notifications` and `expo-router`, both outside this scope).

Used by: no in-scope file is captured in L1's structural edges (the `@/hooks/usePushNotificationRouting` alias goes unresolved), but by direct reading `usePushNotificationRouting()` is called once, in `app/_layout.tsx`.

## Insights

- `Notifications.setNotificationHandler(...)` is a MODULE-LEVEL side effect (not inside the hook body) specifically because it's global app configuration rather than per-mount state — a comment notes it's "registered once, on first import (from app/_layout.tsx)".
- A cold-start tap can fire on BOTH paths: `getLastNotificationResponseAsync` delivers it on mount, but the live listener can also receive the same notification once the app finishes mounting. Deduping is handled via a `Set` of `request.identifier`s kept in a ref, so `handleResponse` navigates at most once per notification regardless of which path (or both) delivered it.
