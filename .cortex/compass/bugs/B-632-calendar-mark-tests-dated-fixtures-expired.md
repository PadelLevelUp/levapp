---
id: B-632
title: "Ten calendar mark/open-spot unit tests (web and iOS) went red on 2026-10-20: their fixtures were dated 2026-10-19 against the real clock"
type: test-defect
severity: medium
status: resolved
resolved: 2026-10-21T21:10:00Z
affects:
  - frontend/apps/web/src/components/calendar/CalendarEventCard.enrolled.test.tsx
  - frontend/apps/web/src/components/calendar/mobile/MobileEventCard.openSpot.test.tsx
  - frontend/apps/mobile/src/features/calendar/enrolled-mark-render.test.tsx
  - frontend/apps/mobile/src/features/calendar/open-spot-render.test.tsx
proposed_fix: "Pin the clock (vi.useFakeTimers toFake Date + setSystemTime 2026-10-18T10:00Z) and derive every fixture date from one DAY constant."
opened: 2026-10-21T20:50:00Z
---

# B-632: calendar mark tests expired with their fixture date (id unconfirmed, wave 16 range)

**Source:** the full unit suites on clean origin/staging 4ba53e151 at 2026-10-21 ~20:50 local
(wave 16, la-2110-SessionD): web 5 and mobile 5 red, the same 10 on a feature branch.

**What happened:** the fixtures were a class on "2026-10-19". `classHasEnded(date, endTime,
now = new Date())` (packages/config participant-groups.ts, through `lisbonNowMs`) reads the real
clock, so from 2026-10-20 the class counted as over, and the ✓ / relation-chip assertions failed
(`expected <span data-testid="calendar-enrolled-mark"> to be null`, `Unable to find
[data-testid="calendar-relation-chip"]`). Every PR's frontend CI turned red the same way.

**Root cause:** Type 7, test defect: the specs (calendar.view rules 13/19, PAD-578/611/664) are
right; the tests compared a fixed date against the real clock.

**Evidence:** red 10/10 on clean staging; with the clock pinned, green 21/21 (web) and 10/10
(mobile); moving the pinned instant to after the class (2026-10-20T10:00Z) brings back exactly the
original failures (3 red in CalendarEventCard.enrolled), and restoring it turns them green.

### Resolution
- Tests: the four files pin `Date` with `vi.useFakeTimers({ toFake: ["Date"] })` +
  `vi.setSystemTime(2026-10-18T10:00Z)` and derive ids, dates, `eventsByDay` keys and test ids from
  one `DAY` constant. No fallback to a far-future date was needed. No source change.
- Resolved: 2026-10-21 (PR feature/pad-683-fixture-dates).
