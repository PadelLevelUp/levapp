---
path: frontend/apps/web/src/components/calendar/ClassDetailSheet.tsx
extracted_at: 2026-09-03T14:16:49Z
extraction_level: 3
size_lines: 1475
size_tokens: 14211
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "2b8b6d2a1c9999bc438f65339ed5b76e346145da79902cb6d760a9f92d4334c1"
---

## Purpose

The single side sheet opened when any class on the calendar is clicked — by far the largest and most central component in this scope. Serves two very different audiences from one component: a coach (`canManage=true`) gets full view/edit/delete/attendance-marking/training-planning/notification-sending, while a student (`canManage=false`) gets a read-only view plus their own proactive-decline (PAD-73) or cancel-attendance (PAD-46) actions. Fetches its own detail data (`getClassInstance`) keyed off the `event` prop, keeps a real-time SSE subscription open while the sheet is open (invitation accept/decline updates, new-notifications-sent), and layers PAD-90/PAD-99-style edit-time overlap warnings, PAD-107 unavailable-student warnings (reused from `AddClassSheet`'s pattern), and PAD-46/PAD-73 attendance-cancellation flows on top of the base edit/delete/attendance-confirm operations.

## Main players

- `ClassDetailSheet(props)` (lines 126–1474) — critical. The component; ~20 `useState` hooks and 5 `useEffect`s covering: instance load, attendance-state seeding, SSE subscription, and derived `active`/`isCanceled`/`cancelInstanceId`/`isStudentParticipant` values recomputed every render from `event`/`classInstance`/`draft`.
- Edit pipeline: `startEdit` → `saveEdit` → `proceedSaveEdit` → `commitEdit(scope)` (lines 369–479) — critical. Mirrors `AddClassSheet`'s save pipeline shape: `saveEdit` checks for a PAD-99 timing-change overlap and may route through `OverlapConfirmDialog` first; `proceedSaveEdit` then either opens `ClassScopeDialog` (recurring class) or commits directly (`commitEdit("single")`). `commitEdit` diffs the draft against the original via `diffInstance`/`diffParticipants` (lines 416–441) so `onEdit` only ever receives the fields that actually changed, plus `addPlayers`/`removePlayers` id arrays.
- `handleConfirmAttendance` (lines 519–584) — critical. Marks attendance for every participant with a non-null status, then branches three ways on the response: a semi-automatic-mode `approvalBundle` (renders `ReplacementApprovalCard`), a set of `notifiedPlayers` (re-fetches the instance to show fresh invitation rows and opens the invitations panel), or a plain success toast.
- `handleCancelAttendance` / `handleProactiveDecline` (lines 610–657) — critical (student path). Both call the same `cancelAttendance(cancelInstanceId)` endpoint; the server itself classifies which kind of decline occurred, so the client never re-derives the reminder-cutoff logic — it only reads `active.canDeclineProactively` (server-computed) to decide which affordance to offer.
- SSE handler in the real-time `useEffect` (lines 249–302) — supporting. Listens for `notification_responded` (patches the matching row in `localInvitations` in place, or re-fetches if the answered invite belongs to a guest-list row not currently shown — PAD-72's "one row per student" quirk) and `notify_sent` (re-fetches invitations and opens the panel).
- `cancelInstanceId` resolution (lines 317–323) — supporting. Prefers the id on the student's own presence (works for a recurring lesson materialized only on confirmation) and falls back to `event.originalId` when the event already points at a concrete `LessonInstance`.

## File map

- Lines 1–95: imports and module-level constants (`COLORS`, `AttendanceRecord` type, props interface).
- Lines 126–367: state declarations, load/SSE effects, and derived read-only values (`active`, `isCanceled`, `cancelInstanceId`, `isStudentParticipant`, `canDeclineProactively`, `canCancelAttendance`, etc.).
- Lines 369–657: all event handlers (edit pipeline, delete, attendance toggling/confirm, training planning, PAD-46/PAD-73 cancel/decline).
- Lines 660–~980: header + info-grid JSX — name/date/time/capacity/level fields, each with a view mode and (for coach) an edit mode; auto-notifications toggle; colour picker and recurrence editor (edit mode only).
- Lines ~980–1130: participants section — `PlayerSelector` in edit mode, else a list of `AttendanceRow`s; the PAD-73 "not attending" banner and proactive-decline button; the invitations disclosure panel; `ReplacementApprovalCard` when an approval bundle is pending.
- Lines 1130–1250: `ClassPlanningSection` (exercise planning) and the footer action row (Edit / Notify / Remind / Delete for a coach; Cancel-attendance/decline for a student).
- Lines 1250–1474: the trailing `AlertDialog`s (cancel attendance, proactive decline, confirm delete) plus `ManualNotificationModal`, two `ClassScopeDialog` instances (edit scope, delete scope), and `OverlapConfirmDialog`.

## Insights

- `EDITABLE_FIELDS` (line 443) is the single source of truth for which top-level instance fields `commitEdit` will diff and send — a field added to the edit form but not to this array will silently never be saved, with no type error to catch it.
- The overlap check in `saveEdit` only fires when date/startTime/endTime actually changed (`timingChanged`), specifically so editing an already-overlapping class's name or participants doesn't re-trigger the warning every save.
- `attendanceAlreadyMarked` (line 306) is derived from `(active?.presences?.length ?? 0) > 0` and drives whether the "Mark attendance" button reads as "Edit attendance" — it is a presence-count check, not a boolean flag, so a class with zero participants can never show "already marked" even after a save.
- The component renders `null` (line 306, `if (!event || !classInstance || !players || !levels) return null;`) whenever any of its core data hasn't loaded yet — there is no loading skeleton state; the sheet simply doesn't render its content until `getClassInstance` resolves.

## Connections

Uses: `frontend/apps/web/src/components/calendar/AttendanceRow.tsx`, `frontend/apps/web/src/components/calendar/ClassPlanningSection.tsx`, `frontend/apps/web/src/components/calendar/ClassScopeDialog.tsx`, `frontend/apps/web/src/components/calendar/ManualNotificationModal.tsx`, `frontend/apps/web/src/components/calendar/OverlapConfirmDialog.tsx`, `frontend/apps/web/src/components/calendar/PlayerSelector.tsx` — all in-scope siblings; plus `@/components/LevelLabel`, `@/components/notifications/ReplacementApprovalCard`, `@/api/classes`, `@/api/events` (`createEventSource`), `@/api/notificationEngine`, `@/api/presences`, `@/api/training`, `@/auth/AuthContext`, `@/hooks/use-toast`, `@/hooks/useAutoInviteEnabled`, `@/lib/calendarOverlap`, `@levelup/config` (`effectiveFilledSpots`) — all outside this scope.

Used by: no file within this scope imports `ClassDetailSheet`; opened from the calendar page (outside `web-components-a`) whenever a `CalendarEventCard` of type `"class"` is clicked.

## Query pointers

- If you need to add or change a class-detail edit field, also read: the `EDITABLE_FIELDS` array and `diffInstance` (this is the one place a new field must be registered), then the matching field in `AddClassSheet.tsx` if the create form needs the same field.
- If you need to touch attendance confirmation or notification sending, read first: `@/api/presences` (`confirmClassPresences`) and `@/api/notificationEngine` (`sendClassReminders`, `cancelAttendance`), then: `frontend/apps/web/src/components/calendar/AttendanceRow.tsx` and `frontend/apps/web/src/components/calendar/ManualNotificationModal.tsx`, which render/collect the data this file's handlers submit.
- If you need to debug a stale invitation badge or a missed real-time update, read: the SSE handler (lines 249–302) and PAD-72's "one row per student" comment — a mismatch between `notificationEventId` and the currently-rendered guest row is the documented cause of a required re-fetch rather than an in-place patch.
