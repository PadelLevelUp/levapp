---
id: notifications.class-reminders-manual
status: implementing
depends_on: [notifications.reminders]
serves: [P-NOTIFICATIONS-7]
governed_by: []
---

# notifications.class-reminders-manual


### Intent
Coaches manually trigger class reminders (outside the automatic schedule).

### Rules
1. `POST /api/app/notify/send_reminders` with class reference
2. Immediately sends reminders to all enrolled players
3. Uses same reminder flow as automatic reminders
4. **Only the class's coach sends its reminders (B-619, R-002).** The route resolves the class through
   the engine's owned resolver: another coach's class is 403, nothing is sent, and a Lesson + date
   ref of another coach's class materialises no occurrence. Before B-619 any coach could push
   reminders to any class by id.
5. **On a new-engine class the send is the engine's (engine plan item #16, 2026-11-25).** After rule 4's
   ownership check, a class with an `engine_sessions` row (`engine_switch.engine_for` is `new`) is sent
   through the engine's `CoachRequestsAttendance` (`notifications.engine-timeline` rule 8), never the
   app's reminder flow, which skips such a class (`notifications.reminders` REMINDERS-34). A class on
   the old engine is unchanged.
6. **The coach is told who was not asked, and why (orchestrator's condition, 2026-11-25).** The answer
   keeps its shape, `{sent, blocked}`, where `sent` is how many students were asked. On a new-engine
   class, a class that has started, is cancelled or is completed asks nobody and answers `sent` 0 and
   `blocked` empty, before anything else is worked out (as the app's send does today). Otherwise
   `blocked` names every going student the send did not ask, once, with one cause: `unavailable`
   (unavailable for the class's slot, `calendar.student-blockers` rule 10), `preference` (blocked all
   notifications, with their reason, `notifications.student-block-preferences`), `already_confirmed`
   (answered, an invitation acceptor placed after the first send, or marked present by the coach),
   `not_coming` (said they are not coming, or marked absent by the coach, `notifications.reminders`
   rule 23), or `reminder_limit` (already asked `attendance_request.max` times in all, counting attempts
   as `notifications.reminders` rule 19 does). The route works out `unavailable`, `preference`, the
   coach's marks and `reminder_limit` in one helper shared with the app's flow, and names those students
   to the engine as skipped; the engine gives the rest their cause. So a 0 is never silent: everyone
   going is either asked or named.
7. **Web and iOS show every cause.** Both apps split `blocked` by cause through one shared function
   (`packages/config` `splitBlockedByCause`) and show, after the reminders answer, the students not asked
   under each cause, with the cause's own words (pt and en); "reminders sent to N" shows when `sent` > 0
   or `blocked` is empty, as today. A row with no `cause` (an older backend) still reads as `unavailable`.

### Not this spec
- The activity feed (`notifications.activity`; retired with the old engine); the engine's schedule
  (`notifications.engine-timeline` rule 2); the old-engine answer, whose `blocked` keeps its two causes.

### Today
- `send_reminders` (`backend/padel_app/modules/notification_engine_api.py`) calls `send_class_reminders`
  for every class; for a new-engine class `_send_class_reminders`
  (`backend/padel_app/services/notification_service.py`) returns `sent: 0`, `blocked: []` at its
  `_on_new_engine` guard (PAD-918). Clients: web `ClassDetailSheet.tsx` (send reminders action), iOS
  `app/class/[id].tsx` (`useSendClassReminders`), shared `packages/api` `sendClassReminders`; the toast
  reads `sent` and `blocked`. Pinned: MANUAL-1 (`test_b619_engine_routes_check_ownership.py`),
  REMINDERS-34 (`test_pad918_reminders_skip_new_engine.py`, service level). `/manual` already branches
  the same way (`_engine_manual`, PAD-932).

### Acceptance Criteria

#### NOTIFICATIONS-CLASS-REMINDERS-MANUAL-1: Another coach cannot send a class's reminders (B-619)
- **Given** coach Ana's class with an enrolled student, and coach Bruno
- **When** Bruno posts `send_reminders` for Ana's class (by its occurrence, or by its lesson and a date with no occurrence yet)
- **Then** the response is 403, no reminder is sent, and no occurrence is created
- **And** Ana's own request for the same class is 200

#### NOTIFICATIONS-CLASS-REMINDERS-MANUAL-2: On a new-engine class the coach's send asks through the engine (rule 5)
- **Given** a coach's new-engine class with two going regulars who have not answered
- **When** the coach posts `send_reminders` for it
- **Then** the response is 200 with `sent` 2 and `blocked` empty, and each of the two has a new `ReminderAttempt` and the reminder message
test: `backend/padel_app/tests/test_engine_coach_asks_attendance.py` › `test_send_reminders_on_a_new_engine_class_asks_through_the_engine`

#### NOTIFICATIONS-CLASS-REMINDERS-MANUAL-3: Every going student not asked is named once with its cause (rule 6)
- **Given** a new-engine class whose going students are: one unavailable for its slot, one who blocked all notifications with a reason, one who answered Yes, one marked present by the coach, one marked absent by the coach, one absent regular, one already asked `attendance_request.max` times, and one with none of these
- **When** the coach posts `send_reminders`
- **Then** `sent` is 1, and `blocked` names the other seven once each with `unavailable`, `preference` (with the reason), `already_confirmed`, `already_confirmed`, `not_coming`, `not_coming` and `reminder_limit`, and none of them gets a `ReminderAttempt`
test: `backend/padel_app/tests/test_engine_coach_asks_attendance.py` › `test_send_reminders_on_a_new_engine_class_names_every_student_not_asked`

#### NOTIFICATIONS-CLASS-REMINDERS-MANUAL-4: A started, cancelled or completed new-engine class asks nobody (rule 6)
- **Given** a new-engine class that has started, one that is cancelled and one that is completed, each with an unavailable going student
- **When** the coach posts `send_reminders` for each
- **Then** each response is 200 with `sent` 0 and `blocked` empty, and no `ReminderAttempt` is written
test: `backend/padel_app/tests/test_engine_coach_asks_attendance.py` › `test_send_reminders_on_a_started_cancelled_or_completed_new_engine_class_asks_nobody`

#### NOTIFICATIONS-CLASS-REMINDERS-MANUAL-5: One shared split gives every cause its own group (rule 7)
- **Given** a `blocked` list with one row of each cause and one row with no cause
- **When** `splitBlockedByCause` splits it
- **Then** each cause's row lands in its own group, the row with no cause in `unavailable`, and no row in two groups
test: `frontend/packages/config/src/notify-blocked.test.ts` › `[NOTIFICATIONS-CLASS-REMINDERS-MANUAL-5] gives every cause its own group`

#### NOTIFICATIONS-CLASS-REMINDERS-MANUAL-6: Web names the students not asked under each cause (rule 7)
- **Given** a reminders answer with `sent` 0 and one student under each of `already_confirmed`, `not_coming` and `reminder_limit`
- **When** the coach taps send reminders on the class sheet
- **Then** the sheet names each student under their cause's words and shows no "reminders sent to 0"
test: `frontend/apps/web/src/components/calendar/ClassDetailSheet.sendReminders.test.tsx` › `[NOTIFICATIONS-CLASS-REMINDERS-MANUAL-6] names the students not asked under each cause`

#### NOTIFICATIONS-CLASS-REMINDERS-MANUAL-7: iOS names the students not asked under each cause (rule 7)
- **Given** the same answer as MANUAL-6
- **When** the coach taps send reminders on the class screen
- **Then** the screen names each student under their cause's words and shows no "reminders sent to 0"
test: `frontend/apps/mobile/src/features/calendar/class-send-reminders-render.test.ts` › `[NOTIFICATIONS-CLASS-REMINDERS-MANUAL-7] names the students not asked under each cause`

### Waves
1. MANUAL-2 to MANUAL-4 — `modules/notification_engine_api.py` (`send_reminders` branches on the
   engine after the ownership check; a started/cancelled/completed new-engine class answers 200 with
   `sent` 0, unlike `/manual`'s 409), the shared skip helper (out of `notification_service._reminder_recipients`
   into one function both flows call), with `notifications.engine-timeline` wave 8 in one change. No migration.
2. MANUAL-5 to MANUAL-7 — `packages/config/src/notify-blocked.ts`, `packages/api` `BlockedStudent.cause`,
   web `ClassDetailSheet.tsx` (uses `splitBlockedByCause`), iOS `app/class/[id].tsx`, web and mobile pt/en
   locales (one line per new cause). Ships with wave 1 (web and iOS together).

### Open questions
- Decisions for rules 5 and 6 are recorded with `notifications.engine-timeline` rule 8's open question
  (engine plan item #16).
