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
6. **The answer's shape is the same on both engines.** `{sent, blocked}`: `sent` is how many students
   the send asked; `blocked` names, with the cause the old route gives (`notifications.student-blockers`
   rule 10, `notifications.student-block-preferences`), each going student it did not ask because they
   are unavailable for the class's slot or blocked all notifications; the route works out the
   unavailable ones and the engine skips them. A class that has started asks nobody: `sent` 0, as today.
   Web and iOS show the answer as they do today.

### Not this spec
- The activity feed (`notifications.activity`); the engine's schedule (`notifications.engine-timeline` rule 2).

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

#### NOTIFICATIONS-CLASS-REMINDERS-MANUAL-2: On a new-engine class the coach's send asks through the engine (rules 5, 6)
- **Given** a coach's new-engine class with two going regulars who have not answered and one who answered Yes
- **When** the coach posts `send_reminders` for it
- **Then** the response is 200 with `sent` 2 and `blocked` empty, each of the two has a new `ReminderAttempt` and the reminder message, and the app's reminder flow sent nothing
- **And** the same request on an old-engine class answers as before (the app's flow)
test: `backend/padel_app/tests/test_engine_coach_asks_attendance.py` › `test_send_reminders_on_a_new_engine_class_asks_through_the_engine`

#### NOTIFICATIONS-CLASS-REMINDERS-MANUAL-3: Blocked students are named and not asked, on the new engine too (rule 6)
- **Given** a new-engine class with a going regular unavailable for its slot, one who blocked all notifications, and one with neither
- **When** the coach posts `send_reminders`
- **Then** `sent` is 1, and `blocked` names the first two with the causes the old route gives for them, and neither gets a `ReminderAttempt`
test: `backend/padel_app/tests/test_engine_coach_asks_attendance.py` › `test_send_reminders_on_a_new_engine_class_names_and_skips_the_blocked`

#### NOTIFICATIONS-CLASS-REMINDERS-MANUAL-4: A started new-engine class asks nobody (rule 6)
- **Given** a new-engine class that has started
- **When** the coach posts `send_reminders`
- **Then** the response is 200 with `sent` 0 and no `ReminderAttempt` is written
test: `backend/padel_app/tests/test_engine_coach_asks_attendance.py` › `test_send_reminders_on_a_started_new_engine_class_asks_nobody`

### Waves
1. MANUAL-2 to MANUAL-4 — `modules/notification_engine_api.py` (`send_reminders` branches like `/manual`),
   with `notifications.engine-timeline` wave 8 in one change. No migration; no web or iOS change (the
   answer's shape is unchanged); existing client tests re-run.

### Open questions
- Decisions for rules 5 and 6 are recorded with `notifications.engine-timeline` rule 8's open question
  (engine plan item #16).
