---
path: frontend/apps/web/src/pages/CalendarPage.tsx
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 476
size_tokens: 4021
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "93d255eddf0a15e492ec7fb02298639ee156535274e09634750027876487b9f0"
---

## Purpose

The `/calendar` page — the app's weekly schedule view, and the most stateful page in this scope. Fetches week-scoped calendar events (`getCalendarEvents`), plus (for coaches only) the roster and coach levels needed by the add/edit-class sheets. Reads a `?classId=…&date=…` deep link on first render (`readDeepLink`, exported), consumes it once via a history-replace `useEffect` so re-navigating never reopens the sheet, and opens the matching event's detail sheet once that week's events have loaded (a `classId` matching nothing is a silent no-op). Renders `MobileCalendarView` vs. the desktop `CalendarHeader`+`CalendarGrid` combo based on `useIsMobile`. Owns drag-to-reschedule (`handleEventDrop` → `RescheduleDialog` → `handleRescheduleConfirm`, branching on class vs. block reschedule), add/edit/delete class flows (routed through `@/api/classes`), and ad-hoc calendar-block create (`@/api/calendar`). `instanceToCalendarEvent` merges a partial `ClassInstance` update into an existing `CalendarEvent`, deliberately using `effectiveFilledSpots` (enrolled minus declined, PAD-71) for the participant-count badge rather than the raw enrollment length. `handleSaveClass` special-cases the `NO_SEASON_COVERS_DATE` rejection code by re-throwing `AddClassRejected` so `AddClassSheet` can show the error inline next to its own toggle instead of via a toast that would vanish along with the now-closed sheet (PAD-90).

## Main players (notable exports beyond the default)

- `readDeepLink(search)` — parses `classId`/`date` query params, silently ignoring an unparseable date.

## Connections

Uses: `@/api/{calendar,classes,coachLevel,players}` (outside this scope), `@/auth/AuthContext` (`useAuth`, this scope), `@/components/calendar/*` (`AddClassSheet`, `AddEventSheet`, `CalendarGrid`, `CalendarHeader`, `CalendarToolbar`, `ClassDetailSheet`, `ClassScopeDialog`, `EventDetailSheet`, `MobileCalendarView`, `RescheduleDialog`, all outside this scope), `@/components/layout/AppLayout`, `@/components/ui/loading-skeleton`, `@/hooks/{use-mobile,use-toast,useCalendar}` (all outside this scope), `@/types` (outside this scope), `@levelup/config` (`effectiveFilledSpots`, external/workspace), external `date-fns`, `react`, `react-i18next`, `react-router-dom`.

Used by: `frontend/apps/web/src/App.tsx`, mounted at `/calendar` (`ProtectedRoute`, any signed-in user).
