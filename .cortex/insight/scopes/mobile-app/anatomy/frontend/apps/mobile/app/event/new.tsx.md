---
path: frontend/apps/mobile/app/event/new.tsx
extracted_at: 2026-09-03T14:11:46Z
extraction_level: 2
size_lines: 422
size_tokens: 3652
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "98efb34a3782619ab06c2d9fc8478e0287340f5f868cd9033272933aa34562ec"
---

## Purpose

New-calendar-event form (available to every role, unlike class creation which is coach-only), mirroring web's `AddEventSheet`: type (personal/break/holiday/off_work), optional title/description, date, start/end time, and a recurring toggle (Monday-first day picker + end date). Pre-fills date from a route param.

## Connections

Uses:
- `frontend/apps/mobile/src/lib/utils.ts`: `cn()` for the day-picker selection styling (unresolved alias).
- `@/features/calendar/hooks` (`useAddEvent`), `@/components/ui/toast` (`toast`): outside this scope.
- `@levelup/types` (`CalendarBlockType`), `@levelup/validation` (`classFormSchema` — reused here, not an event-specific schema), `@levelup/config` (`lightTheme`): outside this scope (packages).

Used by: no file within this scope.

## Insights

- Reuses `classFormSchema` from `@levelup/validation` for the recurring/day/end-date rule rather than a dedicated event schema — a comment marks this as intentional ("same rule set as web's AddEventSheet.handleSave, ported via AddClassSheet's schema"), so the class-form schema is effectively the shared recurring-block validation contract for both classes and events.
- An effect auto-bumps `endTime` to `startTime + 60min` whenever `startTime` changes and the current end no longer follows it (`endTime <= startTime`) — deliberately excluded from its own dependency array via an eslint-disable, since re-including `endTime` would fight the user's manual edits to it.
- The success toast ("Creating…" as a hardcoded literal at line ~406) is the one un-translated user-facing string in this file's save button — every other label goes through `t()`.
