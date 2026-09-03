---
path: frontend/apps/web/src/components/calendar/AddClassSheet.tsx
extracted_at: 2026-09-03T14:16:49Z
extraction_level: 3
size_lines: 593
size_tokens: 5815
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "c26d24268c9237d414634a6776d6298f874a313916f7a6941d8361284cac226e"
---

## Purpose

The "create class" side sheet opened from the calendar toolbar or a slot click. Collects type (academy/private), name, date/time, capacity, level, optional weekly recurrence, auto-notifications toggle, colour, and participants, then hands an assembled payload to the caller's `onSave`. Layers three non-blocking confirmation flows on top of the base save: PAD-99 warns (but never blocks) when the new class overlaps an existing event on the same day; PAD-107 warns when a selected student marked that window unavailable (so no notification can reach them); PAD-90 lets the backend reject a "recurs until season end" class with no covering season and keeps the sheet — and everything the coach filled in — open instead of closing over a silent failure.

## Main players

- `AddClassSheet(props)` (lines 96–592) — critical. The component itself; owns ~15 pieces of form state plus the three confirmation dialogs' open/ack state.
- `handleSave` → `checkUnavailableThenSave` → `proceedSave` (lines 195–310) — critical. The save pipeline, split into three async steps so the overlap dialog (PAD-99) and the unavailable-student dialog (PAD-107) can each re-enter the chain at the point after their own confirmation, without re-running earlier checks.
- `AddClassRejected` (lines 49–54) — critical. Custom `Error` subclass thrown by the caller's `onSave` for a backend rejection the coach can fix without losing the form (currently only `NO_SEASON_COVERS_DATE`, PAD-90); caught in `proceedSave` and rendered inline instead of closing the sheet.
- `defaultEndTime(start)` (lines 88–94) — supporting. `start + 90min`, clamped to the same day; the sheet's long-standing default duration, reused whenever start time changes and no explicit end time was pinned.
- `daysOfWeek` (lines 112–119) — supporting. Locale-aware Mon..Sun weekday initials derived from `date-fns` (`pt`/`enUS` locale), keeping the *order* of days stable across languages while only the labels translate.

## Insights

- `initialEndTime` (PAD-106) is only honoured when explicitly passed (from a calendar drag-select range); otherwise the sheet falls back to `defaultEndTime`. This distinction is re-applied unconditionally on every `open`/`initialDate`/`initialTime`/`initialEndTime` change (not just once) specifically so a previous drag's end time can never leak into the next single-slot click.
- The PAD-99/PAD-107 checks only ever inspect the class's *first occurrence* for a recurring class — the calendar only holds the visible week's events client-side, so there is no cheap way to check every future occurrence, and this is a documented, accepted scope limit rather than an oversight.
- `checkUnavailableThenSave` swallows any error from `checkAvailabilityConflicts` silently (empty catch) — a failed availability lookup must never block a coach from booking; the real enforcement is the backend's send-time block, so the client-side warning is best-effort only.
- `unavailableAcknowledged` resets on any change to date/startTime/endTime/selectedPlayers (PAD-107) — a confirmation only covers the exact slot/roster it was given for.

## Connections

Uses: `frontend/apps/web/src/components/calendar/OverlapConfirmDialog.tsx` (PAD-99 confirm), `frontend/apps/web/src/components/calendar/PlayerSelector.tsx` (participants picker), `frontend/apps/web/src/components/calendar/UnavailableStudentDialog.tsx` (PAD-107 confirm) — all in-scope siblings; plus `@/components/LevelLabel` (level option rendering), `@/hooks/useAutoInviteEnabled`, `@/lib/calendarOverlap` (`findOverlappingEvent`), `@/api/notificationEngine` (`checkAvailabilityConflicts`, `BlockedStudent`) — all outside this scope.

Used by: no file within this scope imports `AddClassSheet`; opened from the calendar page (outside `web-components-a`).

## Query pointers

- If you need to change the create-class form fields, also read: this file's `proceedSave` payload shape — the object keys there are the contract the calendar page's `onSave` handler and the backend endpoint both depend on.
- If you need to touch the overlap or unavailable-student warnings, read first: `frontend/apps/web/src/lib/calendarOverlap.ts` (`findOverlappingEvent`) and `@/api/notificationEngine` (`checkAvailabilityConflicts`), then: the near-identical scope pattern in `frontend/apps/web/src/components/calendar/ClassDetailSheet.tsx`'s `saveEdit`, which reapplies the same PAD-99 check on edit.
