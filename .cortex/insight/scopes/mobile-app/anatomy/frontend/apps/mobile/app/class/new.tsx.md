---
path: frontend/apps/mobile/app/class/new.tsx
extracted_at: 2026-09-03T14:11:46Z
extraction_level: 2
size_lines: 472
size_tokens: 4198
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "ea13ca1ee674d81d9a9803d4810d1adab6804f914fdc69ef54527e447df44629"
---

## Purpose

New-class creation form (coach-only), mirroring web's `AddClassSheet`: name, academy/private type, date, start/end time, capacity stepper, optional level, color swatch, and a recurring toggle (Monday-first day picker + end date). Pre-fills the date from a route param when navigated from a calendar day tap.

## Connections

Uses:
- `frontend/apps/mobile/src/auth/AuthContext.tsx`: `useAuth()` for `user.coachId` (unresolved alias).
- `frontend/apps/mobile/src/lib/utils.ts`: `cn()` for the color-swatch/day-picker selection styling (unresolved alias).
- `@/features/calendar/hooks` (`useAddClass`): outside this scope.
- `@levelup/hooks` (`useCoachLevels`), `@levelup/validation` (`classFormSchema`), `@levelup/config` (`lightTheme`): outside this scope (packages).

Used by: no file within this scope.

## Insights

- Validation is two-layer: local regex/range checks for date/time/capacity format, PLUS `classFormSchema.safeParse` (shared with web via `@levelup/validation`) for the recurring/day/end-date business rule — the shared schema's issues are mapped back onto the same `FieldErrors` shape as the local checks.
- Selecting recurring pre-selects the chosen date's own weekday in `selectedDays` (an effect keyed on `[isRecurring, date]`) — matches web's `AddClassSheet` behavior so a coach doesn't have to re-tick the day they already picked a date for.
- `classType`/day-picker follow the same "value in state, label re-derived via `useMemo(t)`" pattern documented in `players.tsx` — never store a translated string directly.
