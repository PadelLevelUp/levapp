---
path: frontend/apps/web/e2e/availability/unavailable-student-notifications.spec.ts
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 3
size_lines: 195
size_tokens: 1717
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "aa3c47f83d6e3f551c7b936b7b0fe08bf8a3355a99616869137c79e03cc2a91f"
---

## Purpose

PAD-107 cross-role coverage (spec `calendar.student-blockers` rules 4,
8-12): a student creates an availability blocker, then a coach scheduling
a class into that blocked window is warned by name and by reason before
creating (cancel aborts, confirm proceeds anyway), a class outside the
window creates silently, and manually notifying a class that falls in the
blocked window is refused with a named-student message. Runs
`test.describe.configure({ mode: "serial" })` since later tests build on
earlier tests' state, and the final test cleans up the blocker it created.
The blocker is scheduled on the first Monday after today, 18:00-20:00,
deliberately clear of both the seeded "E2E Academy Class" and "E2E Pending
Confirm Class" fixtures.

## Main players

- `firstMondayAfterTodayISO()` (lines 27-35) — supporting. Computes the
  first strictly-future Monday as `YYYY-MM-DD`, the date every test in the
  file anchors its blocker/class fixtures to.
- `openAddClass(page)` (lines 37-45) — supporting. Opens the AddClassSheet
  and waits for its name field to render.
- `fillClassForm(page, name, dateISO, start, end, { withStudent })` (lines
  47-64) — critical. Fills the AddClassSheet's name/date/time fields and,
  when `withStudent`, switches the PlayerSelector to its "All" tab and
  picks the seeded student — every test in this file that creates a class
  goes through this.
- Five `test(...)` bodies (lines 66-195) — critical. The serial sequence:
  student creates the blocker; coach scheduling into the blocked window
  gets warned then can cancel or confirm; a class outside the window
  doesn't warn; notifying a class inside the window is refused; student
  deletes the blocker (cleanup).

## Insights

- `test.describe.configure({ mode: "serial" })` is load-bearing: later
  tests assume the blocker and the "PAD-107 Blocked Class" created by
  earlier tests still exist, so this file cannot be safely parallelized or
  reordered.
- The warning dialog is asserted by content (student name + "unavailable"
  + "notification"), not just presence, so a generic-looking alertdialog
  can't pass for the wrong reason.
- Fixture placement (18:00-20:00 on next Monday, plus a second class at
  15:00-16:00) is deliberately chosen to avoid three other specs' known
  time slots: the seeded "E2E Academy Class" (10:00-11:00), "E2E Pending
  Confirm Class" (18:00-19:00 tomorrow), and schedule-calendar's PAD-99
  overlap spec (10:30 and 07:00) — a sibling-scope file this file's own
  comment names directly.

## Connections

- Uses:
  - `helpers/auth.ts`: `loginAsCoach`, `loginAsStudent`.
  - `helpers/navigation.ts`: `openCalendar`.
  - `helpers/calendar-navigation.ts`: `goToNextWeek`.
- Used by: — (leaf spec file)
- Semantically related (not imports): `.specflow/specs/calendar/student-blockers.spec.md`
  rules 4, 8-12 (named explicitly in the file's header comment); shares
  the blocker CRUD surface with `availability/student-blockers.spec.ts`
  (this scope) and the "PAD-99 overlap" time-slot coordination with
  `schedule-calendar/class-overlap-warning.spec.ts` (sibling scope).

## Query pointers

- If you need to change the student-blocker warning copy or dialog
  structure, also read: `availability/student-blockers.spec.ts` (same
  blocker UI, coach-side absent) and the backend
  invitation/notification-engine service that computes the warning.
- If you need to add another fixture class in the shared seed week, read
  first: this file's time-slot comments and
  `schedule-calendar/class-overlap-warning.spec.ts` (sibling scope) to
  avoid colliding with PAD-99's slots.
