---
path: frontend/apps/web/e2e/notification-engine/reminder-flow.spec.ts
extracted_at: 2026-09-03T15:30:00Z
extraction_level: 3
size_lines: 564
size_tokens: 5849
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "961485ab4b1c30bcd223eefa7fd761178be0879c4cbafaf237a46e8dbfbd01f3"
---

## Purpose

The broadest single file in the notification-engine slice: manual (not
scheduler-fired) notification/invitation flow end to end, standing waiting
list CRUD, auto-notify toggle persistence, and a superseding-reminders
regression (PAD-49) — eight tests total. Explicitly documents WHY it avoids
time-triggered reminders: "APScheduler jobs... cannot be awaited in E2E
tests," using the manual-notify API or direct UI interaction instead (the
scheduler-fired path is covered separately by `auto-reminder.spec.ts` and
`blank-template-fallback.spec.ts`).

## Main players

- `openClassDetail` (lines 32-38) — supporting. Opens the seeded class's
  detail dialog.
- `sendNotificationFromModal` (lines 48-84) — critical. Drives the
  `ManualNotificationModal` UI to send to "E2E Student Two" specifically
  (NOT e2e-student, who is already enrolled and correctly excluded by the
  notification-groups endpoint) — returns `false` gracefully at three
  possible early-exit points (group not visible, student row not found, send
  button disabled) rather than failing, since these states are legitimate
  depending on what earlier tests in the run already did to this shared
  student.
- `coachApiToken`/`studentApiToken` (lines 87-102) — supporting, local login
  helpers (distinct from `helpers/auth`'s UI-driven login).
- US-REM-01 (lines 108-124) — critical. Coach opens the Notify modal and
  sends via UI; tolerant of the "no eligible students" branch (`sent ===
  false`) as a soft pass, since the modal closing cleanly without error IS
  the thing under test in that branch.
- US-REM-02 (lines 130-157) — supporting. UI send + a SEPARATE browser
  context for student-2 (`browser.newContext()`, avoiding stale-JWT
  cross-contamination) to check the invite is visible — deliberately loose
  (`expect(typeof convVisible).toBe("boolean")`), i.e. "flow completed
  without crashing" rather than a strict content assertion.
- US-REM-03 (lines 163-213) — critical. Sends via API directly (bypassing the
  "already notified" UI filter that would block repeated test runs), then a
  second browser context logs in as student-2 and clicks the LATEST
  (`.last()`) "Yes" button — `.last()` specifically because earlier tests in
  the same suite run may have left older, already-responded invites in the
  conversation.
- US-REM-04 (lines 219-280) — critical. Mirror of US-REM-03 for decline
  (`.last()` "No" button), asserting the response settles
  (`waitForResponse` on `/notify/respond`) before checking for no error.
- US-REM-05 (lines 288-349) — supporting. UI-drives the Standing Waiting List
  section, tolerant of three possible rendered states (search input / empty
  state / existing list), added specifically to exercise the
  `GET /notify/standing_waiting_list` endpoint that used to 500 before an
  `updated_at` migration fix.
- US-REM-06 (lines 355-402) — critical, pure API. Full CRUD round-trip on the
  standing waiting list: add (camelCase payload), verify present, delete,
  verify gone.
- US-REM-07 (lines 408-473) — critical. Auto-notify toggle persistence: reads
  `aria-checked`, clicks and waits for the `/notify/config` save POST,
  reloads and asserts the state survived, then flips it BACK to avoid
  leaking state into later tests — a fallback locator strategy (scoped-switch
  vs. a broader `.last()` switch query) with a `test.skip` escape hatch if
  neither finds the control.
- US-REM-08 (lines 484-563) — critical, PAD-49 regression. When a student
  gets a SECOND reminder for the same instance (config bumped to
  `reminderCount: 2`, `hoursBetweenReminders: 1`, then `send_reminders` called
  twice against a FRESH dedicated instance created via the same debug
  endpoint `auto-reminder.spec.ts` uses, with a large `secondsUntilReminderFires:
  3600` so the SCHEDULED job never actually fires mid-test — only the manual
  `send_reminders` calls matter here), the OLDER reminder's Yes/No buttons
  must be replaced by a disabled "reminder expired"/"lembrete expirado"
  indicator, while only the LATEST reminder (`.last()` Yes button) stays
  actionable.

## Insights

- The repeated `.last()` locator pattern across US-REM-03/04/08 encodes a
  real invariant about this file's test ORDER-DEPENDENCE: because tests share
  the seeded student-2's conversation history and don't reset it between
  tests, every assertion about "the current invite/reminder" must explicitly
  target the newest DOM element, never assume a fresh/empty conversation.
- US-REM-01/02's tolerance for "no eligible students" / loose boolean checks
  is a deliberate acknowledgment that this file runs AFTER other
  notification-engine specs in a full suite run and cannot assume a clean
  slate — contrast with `semi-auto-approval.spec.ts`, which sidesteps the
  same problem by creating brand-new dedicated classes per test instead.
  Both are valid answers to the same shared-DB-state problem.
- `openMessages` from `helpers/navigation` is used across five of the eight
  tests but never in a shared `beforeEach` — each test independently
  sequences `loginAs*` → `open*` because different tests need different
  logged-in identities (coach for some, student/student-2 in separate
  browser contexts for others).

## Connections

- Uses: `helpers/api` (`API_APP`, `API_AUTH`); `helpers/auth` (`loginAsCoach`,
  `loginAsStudent`, `loginAsStudent2`); `helpers/navigation` (`openCalendar`,
  `openSettings`, `openMessages`); `helpers/calendar-navigation`
  (`findClassOnCalendar`). (Scope `web-e2e-a`.)
- Used by: — (Playwright entry point; not imported elsewhere)
- Semantically related (not imports): exercises
  `frontend/apps/web/src/components/calendar/ManualNotificationModal.tsx`,
  the manual-notify (`/notify/manual`), respond (`/notify/respond`),
  standing-waiting-list, and `send_reminders`/reminder-superseding routes in
  `notification_engine_api.py` / `notification_service.py`; covers
  `.specflow/specs/notifications/manual.spec.md`,
  `.specflow/specs/notifications/waiting-list.spec.md`, and
  `.specflow/specs/notifications/reminders.spec.md` (superseding-reminders
  rule, PAD-49).

## Query pointers

- If you need the manual-notify send UI path, also read:
  `manual-notify-selection.spec.ts` (this scope — same
  `ManualNotificationModal`, different bug/assertion focus).
- If you need scheduler-FIRED (not manual) reminder behaviour, read instead:
  `auto-reminder.spec.ts` and `blank-template-fallback.spec.ts` — this file
  deliberately avoids that path.
- If you need standing-waiting-list expiry/visual-state rules, read next:
  `standing-waitlist-expired.spec.ts` (this scope) — this file's US-REM-05/06
  only cover basic CRUD, not the expiry distinction.
