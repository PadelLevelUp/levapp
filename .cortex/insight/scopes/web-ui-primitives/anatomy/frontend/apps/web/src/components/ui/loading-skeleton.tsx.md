---
path: frontend/apps/web/src/components/ui/loading-skeleton.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 245
size_tokens: 2044
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "4389a56309bb16750f02b6704d4e721ef050283cf4e14a21b2e6e1e2f1b1b028"
---

## Purpose

LevApp-specific loading-state library — not a shadcn/Radix wrapper. Exports a generic `LoadingSkeleton` (`default`/`shimmer`/`pulse`/`wave` animation variants) plus a family of page-shaped skeletons (`LoadingCard`, `LoadingClassItem`/`LoadingClassList`, `LoadingCalendar`, `LoadingConversationList`, `LoadingChatThread`, `LoadingMessages`, `LoadingDashboard`, `LoadingPlayerCard`/`LoadingPlayersGrid`) that mirror the real layout of the calendar, messaging, and dashboard screens so nothing jumps on hydration. `LoadingMessages` carries a documented fix in its own comment: the real messages page shows one pane on mobile and two side-by-side on desktop, but the skeleton used to render both unconditionally, overflowing a 390px viewport by 159px — clipped by an ancestor, so it never showed up as document-level overflow — now gated correctly with `hidden md:flex`.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.
