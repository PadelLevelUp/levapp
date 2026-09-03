---
path: frontend/apps/web/src/components/players/detail/AddToClassesDialog.tsx
extracted_at: 2026-09-03T14:17:06Z
extraction_level: 2
size_lines: 272
size_tokens: 2497
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "eb3b22d026dfc42af45e6f71afbfee3fd3b10d66c497db6b806eed679c494fb3"
---

## Purpose

A week-by-week class picker for bulk-adding one player to multiple classes at once: navigate weeks, check off classes (full ones are disabled, not hidden), then `handleSave` calls `editClass(cls, { addPlayers: [...] }, "single")` once PER selected class sequentially, tallying successes/failures independently so a partial failure still reports how many succeeded rather than an all-or-nothing result. A failed `getClassInstances` fetch explicitly renders an error toast rather than falling through to the "no classes this week" empty state (PAD-80 — that silent fallback used to read as "you have no classes" instead of "we couldn't load them").

## Connections

Uses: `@/api/classes` (`editClass`, `getClassInstances`, outside this scope); `date-fns` + `date-fns/locale`'s `enUS` (hard-coded — week/day labels render in English regardless of the app's active i18n language, unlike most of the rest of this scope which goes through `react-i18next`/`@levelup/config`'s date formatters); `@/components/ui/button`, `@/components/ui/badge`, `@/components/ui/checkbox`, `@/components/ui/dialog`, `@/components/ui/scroll-area`, `@/components/ui/skeleton`; `@/lib/utils` (`cn`); `@/types` (`CalendarEvent`, `CoachPlayer`); `sonner` (`toast`).

Used by: a player-detail page (outside this scope), which supplies `player` and an optional `onSave`.

Semantically related (not imports): `dashboard/coach/Schedule7Days.tsx`, `presences/*` — other week-scoped/date-formatted views in this scope, but those go through `@levelup/config`'s locale-aware `weekdayShort`/`weekdayLong` rather than this file's hard-coded `enUS`.
