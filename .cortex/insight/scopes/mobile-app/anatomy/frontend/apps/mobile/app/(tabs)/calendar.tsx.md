---
path: frontend/apps/mobile/app/(tabs)/calendar.tsx
extracted_at: 2026-09-03T14:11:46Z
extraction_level: 2
size_lines: 204
size_tokens: 1808
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "f9d5ac31f52f0476b16bcbc53a3ddf621e0685f563ced58c90fc3ed4f03e183a"
---

## Purpose

The Calendar tab: a split view mirroring `apps/web`'s `MobileCalendarView` — a horizontally-scrolling week strip across the top and the selected day's class/event list underneath. Fetches one week of events at a time, buckets them by day, computes the "next" class highlight (gated on the visible week actually containing today, not just the selected day), and offers role-scoped FABs (Add event for everyone, Add class for coaches only).

## Connections

Uses:
- `frontend/apps/mobile/src/auth/AuthContext.tsx`: `useAuth()` for the `isCoach` role check (unresolved alias).
- `frontend/apps/mobile/src/lib/utils.ts`: `cn()` to conditionally position the FABs (unresolved alias).
- `@/features/calendar/EventCard`, `@/features/calendar/WeekStrip`, `@/features/calendar/params` (`eventToParams`): outside this scope.
- `@levelup/config` (`findNextEventId`, `lightTheme`), `@levelup/hooks` (`useCalendar`, `useCalendarEvents`, `useCoachLevels`), `@levelup/types` (`CalendarEvent`): outside this scope (packages).

Used by: no file within this scope.

## Query pointers

If you need to change what counts as "next", read the `nextEventId` memo here — it deliberately gates on `calendar.weekDays.some(isToday)` rather than the selected day, matching the web grid's rule (see `EventCard`, outside this scope, for how the highlight renders).
