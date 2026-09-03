---
path: frontend/apps/mobile/app/(tabs)/_layout.tsx
extracted_at: 2026-09-03T14:11:46Z
extraction_level: 2
size_lines: 237
size_tokens: 2247
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "b9115a09c894a8ec27500476a0e9b5871de0f3457a0f8b67a5fec5041f2de67a"
---

## Purpose

The tab navigator root (`(tabs)` route group): renders the eight-destination bottom tab bar (dashboard, calendar, players, presences, messages, availability, training, settings), gates it behind auth (`Redirect` to `/login` if unauthenticated), and role-splits tabs via `href: null` — Players/Presences/Training are coach-only, Availability is student-only. Owns the navy app-bar chrome (LevAppMark + per-tab header) and mirrors the unread-message count onto both the Messages tab badge and the iOS home-screen (springboard) badge via `Notifications.setBadgeCountAsync`.

## Connections

Uses:
- `frontend/apps/mobile/src/auth/AuthContext.tsx`: `useAuth()` for `user`/`loading`/`isAuthenticated` (unresolved alias `@/auth/AuthContext`, not in L1's resolved graph).
- `frontend/apps/mobile/src/lib/sse.ts`: `useAppEvents()` to invalidate the unread-count and conversations queries on `message_*` SSE events (unresolved alias `@/lib/sse`).

Used by: no file within this scope (reached by expo-router's file-based routing for the `(tabs)` group, not a JS import).

Semantically related (not imports): mirrors the badge-sync fix described for PAD-147/PAD-153 — before this, no code path ever cleared a stale iOS badge; driving it off `useUnreadCount` (the same query the in-app tab badge uses) makes the two badges structurally unable to disagree.
