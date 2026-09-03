---
path: frontend/apps/web/src/hooks/useCalendar.ts
extracted_at: 2026-09-03T14:14:29Z
extraction_level: 2
size_lines: 2
size_tokens: 12
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "52cef62c42cc4f5fa98a82f1718813d3b96c0db29a24458cc8b2d1a122eedc0a"
---

## Purpose

A one-line re-export: `export { useCalendar } from "@levelup/hooks"` — week-based calendar navigation state (current week's range/days, event grouping per day, `navigateWeek`/`goToToday`) shared by web and mobile. Unlike `useAutoInviteEnabled.ts`/`useFieldAvailability.ts`, it does NOT import `@/api/client` first, because `useCalendar` operates purely on a `CalendarEvent[]` array passed in by the caller — it makes no `getApi()` calls of its own, so there's no singleton dependency to satisfy.

## Connections

Uses: `@levelup/hooks` (outside scope): re-exports `useCalendar`.

Used by: no file within this scope (its consumer is the calendar page, outside `api/`/`hooks/`/`data/`).

Semantically related (not imports): `frontend/apps/web/src/hooks/useAutoInviteEnabled.ts`, `useFieldAvailability.ts` — same `@levelup/hooks` re-export pattern, but those two DO need the `@/api/client` side-effect import since their underlying hooks call `getApi()`.
