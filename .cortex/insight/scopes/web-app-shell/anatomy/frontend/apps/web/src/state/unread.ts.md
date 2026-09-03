---
path: frontend/apps/web/src/state/unread.ts
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 19
size_tokens: 97
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "44ca4696ab2ea63d885d4fb04de0c42134fa87d25cc69220e2844715a1f8da15"
---

## Purpose

A minimal module-level singleton for the app's unread-message count: `setUnreadListener`/`clearUnreadListener` register (at most one) callback, and `updateUnreadCount` pushes a new count to it and caches it in `currentUnread` (so `setUnreadListener` can immediately replay the last known value to a newly-registered listener). Not a React context or store — plain module-scoped mutable state, presumably to let non-React code (e.g. an SSE handler) push unread-count updates without needing a hook.

## Connections

Uses: no imports.

Used by: not resolved within this scope's import graph (no `edges_within_scope`/`edges_crossing_scope` entry names a consumer or producer). The evident intended callers are `MessagesPage.tsx`'s SSE handling (`@/api/events`, outside this scope) as the producer and `@/components/layout/LayoutContext` (outside this scope, `setUnreadCount`/`refreshUnreadCount` used by `DashboardPage.tsx` and `MessagesPage.tsx`) as a plausible consumer — not confirmed by a resolved import in this slice.
