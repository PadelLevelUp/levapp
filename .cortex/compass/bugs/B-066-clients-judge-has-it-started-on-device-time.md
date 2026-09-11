---
id: B-066
title: "Web and iOS judge 'has it started', 'past', 'next', deadlines and today on device time; right only on a Lisbon device"
type: incomplete-rule
severity: medium
status: resolved
affects:
  - attendance.confirm
  - calendar.view
  - notifications.reminders
  - notifications.semi-auto-approval
  - frontend/packages/config/src/calendar-status.ts
  - frontend/packages/hooks/src/useCalendar.ts
  - frontend/apps/web/src/components/calendar/ClassDetailSheet.tsx
  - frontend/apps/web/src/components/messages/MessageBubble.tsx
  - frontend/apps/web/src/components/notifications/ReplacementApprovalCard.tsx
  - frontend/apps/mobile/src/features/calendar/attendance-decline.ts
  - frontend/apps/mobile/src/features/messages/reminder-state.ts
proposed_fix: "lisbonNow() / isClubToday() in @levelup/config next to B-060's clubTodayISO; every client comparison of a stored wall-clock value with now uses them; red-first unit tests under TZ=Asia/Tokyo and TZ=America/Sao_Paulo, a Playwright case with timezoneId."
opened: 2026-09-11T14:40:00Z
resolved: 2026-09-11T15:00:00Z
---

# B-066 — Web and iOS judge "has it started" on device time

**Source:** wave-2 open item (Session A, 2026-09-10: "clients' lisbonNow() for 'has it started',
~8 sites, device time today"); ticket PAD-295, Session F.

**What happens:** class, block, deadline and window times arrive as Lisbon wall-clock digits
(R-023, decision 2026-09-10 class-time-storage): `date` + `HH:mm`, reminder `startsAt`
(`instance.start_datetime.isoformat()`), `cancellationDeadline` (`utc_to_wall_naive(...).isoformat()`),
`windowOpenAt` (same). Both clients turn those digits into a `Date` in the **device's** zone
(`new Date(y, m, d, h, min)` / `new Date("2027-07-15T10:30:00")`) and compare it with
`Date.now()` / `new Date()`. On a device in Lisbon the two clocks agree. Anywhere else every
decision is off by the device's offset from Lisbon: in Tokyo (UTC+9, 8 h ahead in summer) a class
at 10:30 Lisbon reads as started from 02:30 Lisbon, cancel-attendance disappears eight hours early,
reminders expire eight hours early, the "next" highlight skips to a later class, the today ring
and `Hoje` land on the wrong date between 15:00 and 24:00 Lisbon.

**What should happen:** the clients compare stored wall-clock values with the club's clock, as
the server does with `club_now_naive()` (attendance.confirm rule 9, reminders rule 10).

**Root cause (Phase 1):**
1. Read: `packages/config/src/calendar-status.ts` `findNextEventId(events, now = new Date())`,
   `resolveEventState(event, { now = new Date() })` against `eventTimes()` = `localDateTime()`
   (device-local from digits); `apps/web/.../ClassDetailSheet.tsx:438` `classStartAt.getTime()
   <= Date.now()`; `:452` deadline vs `Date.now()`; `MessageBubble.tsx:340,353`;
   `ReplacementApprovalCard.tsx:44`; `apps/mobile/.../attendance-decline.ts` `hasClassStarted(...,
   now = Date.now())`; `reminder-state.ts` `now = new Date()`; the `isToday(d)` gates in
   `CalendarGrid`, `MobileCalendar`, `app/(tabs)/calendar.tsx`; the today rings in `DayStrip`,
   `WeekHeaderRow`, `MonthGrid` on both shells; `useCalendar` `new Date()` ×3.
2. Reproduced: the PAD-295 unit tests, run with `TZ=Asia/Tokyo` and `TZ=America/Sao_Paulo`, fail
   on the pre-change code with the wrong state (`past` for a class 30 Lisbon-minutes ahead,
   `hasClassStarted` true, `reminderState.superseded` true, `goToToday` on the wrong date) and pass
   in Lisbon and UTC — exactly the symptom.
3. Recent change: B-060 (#192, 2026-09-10) fixed the clients' *dates* (`clubTodayISO`) and left the
   instant comparisons for a follow-up; nothing else touched these lines since PAD-256.
4. First wrong value: the `now` side of each comparison (device clock), not the stored digits.

**Diagnostic tree:** dev specs exist and their rules name the club's clock, but attendance.confirm
rule 7 said "so a client on Lisbon time reads it as the right moment" — the rule stopped at Lisbon
devices — and no rule or criterion said what the *clients'* "now" is. → type 2, `incomplete-rule`.
No business drift: the outcomes never mention device zones.

**Affected specs:**
- Dev: `attendance/confirm.spec.md` (rules 7, 9), `calendar/view.spec.md` (new rule 16),
  `notifications/reminders.spec.md` (rule 10), `notifications/semi-auto-approval.spec.md`
- Business: unchanged

### Change Plan

**Specs:** rule 7/9 wording + criterion "Started and late cancellation are judged on the club's
clock on any device"; calendar.view rule 16 + criterion "Past and next are judged on the club's
clock on any device"; one-line client notes on reminders rule 10 and semi-auto-approval.

**Then:**
1. `lisbonNow(now?)` and `isClubToday(day, now?)` in `packages/config/src/club-date.ts`.
2. Defaults in `calendar-status.ts`, `day-dots.ts`, `attendance-decline.ts`, `reminder-state.ts`,
   `useCalendar.ts`; explicit `lisbonNow()` in `ClassDetailSheet`, `MessageBubble`,
   `ReplacementApprovalCard`; `isClubToday` in the gates and rings on both shells.
3. Tests first: packages (club-date, calendar-status), hooks (useCalendar), mobile
   (attendance-decline, reminder-state), Playwright `club-clock.spec.ts` with `timezoneId`.
   Maestro cannot change the simulator's zone: not run, recorded in the PR.

### Resolution

- Spec changes: attendance.confirm rules 7, 9 + criterion; calendar.view rule 16 + criterion;
  notifications.reminders rule 10; notifications.semi-auto-approval (windowOpenAt).
- Tests added: `packages/config/src/club-date.test.ts` (lisbonNow, isClubToday),
  `calendar-status.test.ts` (default clock), `packages/hooks/src/useCalendar.test.ts` (club's
  today), iOS `attendance-decline.test.ts` and `reminder-state.test.ts` (default clock; the
  attendance fixture's "now" anchored on the club's clock), Playwright
  `schedule-calendar/club-clock.spec.ts` (US-295-1, `timezoneId: Asia/Tokyo`). All watched red
  under `TZ=Asia/Tokyo` / `TZ=America/Sao_Paulo` on the device-time code; green in Tokyo,
  São Paulo, Lisbon and UTC after.
- Code changes: `lisbonNow()` / `isClubToday()` in `@levelup/config`; defaults in
  `calendar-status.ts`, `useCalendar.ts`, iOS `day-dots.ts`, `attendance-decline.ts`,
  `reminder-state.ts`; explicit comparisons in `ClassDetailSheet`, `MessageBubble`,
  `ReplacementApprovalCard`; next-class gates and today rings on both shells.
- Not run: a simulator walk in a non-Lisbon zone (the simulator follows the host clock); iOS is
  covered by the shared helper's tests and the mobile unit tests in four zones.
- Review follow-up (Session G, same day): comparisons moved from a device-local wall-clock
  Date to UTC-anchored digits (`lisbonNowMs` vs `wallClockMs` / `wallClockISOMs`) because a
  device's own DST gap can push the local Date (Europe/Madrid, 2027-03-28: a class ending 03:15
  read as past 45 min early — red under `TZ=Europe/Madrid`, green in five zones after);
  `lisbonNow()` is rendering-only and branded `ClubWallClock`. Three more sites switched: iOS
  `approvalCardState.windowOpenAt`, and the ValidateClasses week label on both shells now comes
  from `weekBounds` (`weekLabelDates`). Five B-060 strays fixed with `clubTodayISO`.
- Resolved: 2026-09-11 (PAD-295).
