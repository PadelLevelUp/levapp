---
id: B-671
title: "The reminder debug endpoint's test class fires its 48 h reminder an hour late (or early) when the 48 h cross a daylight-saving change"
type: test-defect
severity: medium
status: resolved
affects:
  - backend/padel_app/modules/notification_engine_api.py
  - frontend/apps/web/e2e/dashboard/student-dashboard-home.spec.ts
proposed_fix: "Build the test class from the real clock (utc_to_wall_naive(utcnow_naive() + 48 h + s)) so the engine's real-hours count lands s seconds from now in every season."
opened: 2026-10-23T07:25:00Z
resolved: 2026-10-23T07:45:00Z
---

# B-671: the reminder test class fires an hour off across a daylight-saving change

**Source:** la-2110-SessionD, the subset lane of #820 (run 39912932369, red twice). Linear PAD-750.

**What happens:** `e2e/dashboard/student-dashboard-home.spec.ts:251` (PAD-202, "Yes on the class
row…") fails at line 301: its 60 s poll for the reminder times out. No "Reminder sent" line follows
`POST /api/app/notify/debug/schedule_reminder_test`. Every spec that waits on that endpoint is
exposed. From 2026-10-23 about 00:55 UTC to 2026-10-25 01:00 UTC it failed on any branch, prod
`main` 76112b3cb included.

**What should happen:** the reminder fires `secondsUntilReminderFires` after the call, in any
season.

**Root cause:** the endpoint set the class to `club_now_naive() + 48 h + s` on the Lisbon wall
clock. The engine (`scheduler._fire_time_utc`, PAD-256, R-023) correctly counts the 48 h back in
real hours from the class's real start. When now + 48 h crosses the autumn change (UTC+1 to UTC+0),
the reminder lands an hour after `s`. Across the spring change it lands an hour before, already past
due. The product rule is right; the test helper was wrong.

**Evidence:** the real `_fire_time_utc` on staging code:
- Scheduled 2026-10-23 00:21:33 UTC: class wall 10-25 01:21:38, fires 5.0 s later. This is #820's
  green subset at a66951c98.
- Scheduled 07:12:41 UTC: class wall 10-25 08:12:46, fires 3605.0 s later. This is the red one.

A local isolated stack failed the same way on staging 6de507eaa and on main 76112b3cb, with TZ=UTC
too. That evidence selected type 7: no spec governs the debug helper, the engine matches its rule,
and only the helper's arithmetic is wrong.

**Affected specs:**
- Dev: none (an E2E helper endpoint). Notifications reminders rule 15 is the engine's correct rule.
- Business: none

### Change Plan

**Test helper:** `debug_schedule_reminder_test` builds the class as
`utc_to_wall_naive(utcnow_naive() + 48 h + s)`.

**Then:**
1. Add a pytest that pins the clock before the autumn change, before the spring change, and in a
   change-free week, and asserts `_fire_time_utc(start, 48 h) == now + s`.
2. Run it red without the fix and green with it.
3. Run the PAD-202 spec on an isolated stack.

### Resolution

- Spec changes: none.
- Tests added: `backend/padel_app/tests/test_pad750_reminder_test_class_dst.py`, three cases.
  Without the fix, autumn and spring fail. With it, all three pass, and B-131's three tests pass
  too.
- Code changes: `notification_engine_api.py`, the class start of the debug endpoint.
- E2E: `student-dashboard-home.spec.ts` on an isolated stack at staging 13f95c884 plus the fix,
  2026-10-23 07:36 UTC: 6 passed. The reminder fired 4 s after `schedule_reminder_test`.
- Resolved: 2026-10-23.
