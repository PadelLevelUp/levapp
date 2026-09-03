---
path: frontend/packages/hooks/src/useCalendar.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 106
size_tokens: 682
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "63dc98eba5cf66c2dbc6f4346a2a88711331fdcbb8a7d5bb3e98f7c5843d99ee"
---

## Purpose

Week-based calendar navigation state, shared by web and mobile: given a flat list of `CalendarEvent`s, derives the current week's range/days, filters events into that window, groups them per day (`getEventsForDay`), and exposes `navigateWeek`/`goToToday`. `initialDate` is read only on first render — meant for callers who already know which week to open (e.g. a `?date=` deep link) so the first events fetch targets the right week instead of the current one. `weekLabel` is a compact "6–13 Jul" / "28 Jun–4 Jul" string kept short enough to fit a single line on a 375px mobile header.

## Connections

Uses:
- `frontend/packages/types/src/domain.ts` (via `@levelup/types`): `CalendarEvent`.

Used by:
- `frontend/packages/hooks/src/index.ts`: re-exported by name.
