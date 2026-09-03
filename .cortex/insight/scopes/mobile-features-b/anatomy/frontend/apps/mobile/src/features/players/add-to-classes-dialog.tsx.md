---
path: frontend/apps/mobile/src/features/players/add-to-classes-dialog.tsx
extracted_at: 2026-09-03T14:12:18Z
extraction_level: 2
size_lines: 337
size_tokens: 2951
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "156b0978b8863133f67c84aa10a5deb9de579833cd4305c332ac189e71768620"
---

## Purpose

`AddToClassesDialog` is the mobile port of web's dialog for enrolling one player into one or more upcoming classes from outside the class-detail flow (e.g. from a player's own screen). It browses classes week-by-week, lets the coach multi-select classes (disabling ones already at capacity), and on save POSTs one `edit_class` mutation per selected class with `updates.addPlayers: [playerId]` and `scope: "single"`. The doc comment records that this fixes a real bug in the web source it was ported from: web's `onSave` used to only fire a success toast without calling the API at all — this port wires the save for real.

## Connections

Uses: `frontend/apps/mobile/src/features/players/hooks.ts`: calls `useClassInstancesForWeek(from, to, open)` to fetch the week's `CalendarEvent[]` for the currently browsed Monday–Sunday range.

Used by: no in-scope file imports this dialog (no in-edges in this scope's L1 data); it is a leaf UI component, presumably rendered from a player-detail screen outside this scope (its props — `playerId`/`playerName` — match that call pattern, but no import edge confirms it from within this slice).

Semantically related (not imports): `frontend/apps/mobile/src/features/calendar/hooks.ts` (outside scope) via `useEditClass` — the actual mutation hook that performs the `POST /app/edit_class` call this dialog drives; also invalidates `["class-instances-week"]` manually after saving since `useEditClass`'s own invalidation doesn't cover this dialog's week query.
