---
id: notifications.engine-store
status: draft
depends_on: [notifications.engine-planning, notifications.engine-answers]
serves: [P-NOTIFICATIONS-8]
governed_by: []
---

# notifications.engine-store

### Intent
What the new engine's table-backed store guarantees when it writes the engine's effects and sends its
messages (PAD-916; swap plan §5). The engine decides; the store makes each decision land exactly once.

### Entities
- **READS:** the engine's effects (`invitation_engine/effects.py`); the coach's level ladder and each
  account's status, to build the snapshot.
- **WRITES:** `EngineEffect` (one row per effect applied), `EngineInvitation`, the app's presences and
  messages through the outbox (`padel_app/services/engine_store.py`, `dispatch`).

### Rules
1. **An effect is written once.** Each effect has a content key; applying the same effect again, as a
   retried apply does, writes nothing more.
2. **The outbox sends each message once.** The effects that reach a person (`Invited`, `Message`,
   `AttendanceRequested`, `CoachAlert`, `ApprovalRequest`) become outbox rows in the unit that applies
   them. `dispatch` claims rows and commits the claim before it sends, so a row is sent at most once;
   an effect that reaches nobody (an `Answered`) is no outbox row.
3. **The store refuses what the engine forbids.** A second invitation for one student and session
   (`notifications.engine-planning` rule 2), a second waiting-list entry (`notifications.engine-answers`
   rule 12) and a second placement at the same hour (`notifications.engine-answers` rule 10) are
   refused; their criteria are in those specs.
4. **The store hands the engine levels as ladder positions.** Each level the engine reads (a student's
   and the class's) is its position on the session's coach's ladder, 1 the strongest and consecutive,
   counted as the app's `ladder_index` counts it, whatever the stored `display_order` values; a level
   that is not on that coach's ladder (another coach's level) reaches the engine as none: for a student
   that fails every level rule, for a class it applies none (`notifications.engine-tiers` rule 13). A student's `subscription_status` is their
   account's `User.status`. Each session's end is its start plus its lesson's duration, and the
   sessions a student is going to of the same coach are handed with their intervals, for
   `notifications.engine-tiers` rule 3's overlap. A presence is **going** unless the student left: a
   regular's No, a cancellation, or the coach marking them absent **before the class starts** (which
   reaches the engine as the regular's absence, freeing the spot as today, `attendance.confirm` rule
   13). A no-show, or the coach's absent mark once the class has started, records attendance only: the
   student stays placed.
5. **The store keeps each session's approval state as the engine's effects leave it** (semi-automatic
   mode, `notifications.engine-planning` rule 14, per group), in the session's row (`engine_sessions`:
   approved groups, removed students, pending requests by group, dismissed groups): `ApprovalRequest`
   sets its group's pending request; `GroupApproved` adds the group to the approved ones, adds to the
   removed students and ends that request; `GroupDismissed` ends the request and marks the group
   dismissed with the spot counts it saw; `GroupReopened` ends that group's dismissal;
   `ApprovalWithdrawn` ends the request. Each `ApprovalRequest` is sent once (rule 2).
6. **Who has confirmed.** The snapshot's confirmed students are those whose attendance request was
   answered yes (`ReminderAttempt`) and those whose presence answer is `confirmed`, whoever recorded it
   (`notifications.reminders` rule 22: a class created after its reminder time counts its students as
   coming).

7. **The tick.** One scheduler job, `engine_tick`, runs every const:ENGINE_RUN_EVERY: it lists the
   new-engine sessions (`notifications.config` rules 18, 19) and plans each in its own unit and its own
   transaction (`notifications.engine-planning` rule 1). A session that raises is rolled back and
   skipped, and the tick goes on with the rest (`notifications.invitations` rule 21's new reading); the
   failure is recorded as `admin.engine-health` rule 12 says. The outbox is sent after the sessions.

8. **Invitation messages and alerts stay current** (`notifications.invitations` NB1a;
   `notifications.engine-planning` rule 11). The store keeps each invitation's message ids, its
   `closed_reason` (`withdrawn` | `same_hour` | `class_removed`) and `reopened_at`, writes the invitation's state (`open`, `answered` with `response`
   and `answeredBy`, `sorry`, `reopened`, `withdrawn`, `closed_same_hour`) and `startsAt`/`countsUntil`
   on its live messages: every attached message until the invitation is reopened; from then the older
   bubbles keep `reopened` and later states land only on the newest bubble, the one with live buttons. It
   publishes one `message_edited` per message after the commit. A
   withdrawal is the store's own `withdraw(invitation_id, at)`, which rule 19's route calls; it is no
   engine effect. An `AlertCleared` drops that alert.

9. **The side of a coach's add (PAD-808, `classes.join-requests` NJ4).** The app hands the engine
   `CoachAdded(student, side)` with the side the coach chose: for an accepted join request, the request's
   side (`left`/`right`; `both` or none passes none); for the coach's add to the class, the student's
   side for that session (`presences.side`, PAD-551), else none. The engine's `SideAssigned` from it is
   written as the presence's `assigned_side`, as every placement side is, so the snapshot counts the
   student on that side from the next run.

### Not this spec
- Which sessions the store lists and how it builds the settings (`notifications.config` rules 18, 19).
- The locks a unit takes (`notifications.engine-answers` rule 10).

### Today
- The engine's in-memory store is `invitation_engine/store.py` (`MemoryStore`, `apply`, `unit`); the
  table-backed store and its outbox are PAD-916's (`padel_app/services/engine_store.py`, on H's branch,
  not yet on staging), pinned by `backend/padel_app/tests/test_pad916_engine_store.py`. The old engine
  has no outbox: it sends inside its own transactions (`notification_service.py`).

### Acceptance Criteria

#### NOTIFICATIONS-ENGINE-STORE-1: An effect applied twice is written once (rule 1)
Given an `Invited` and an `AttendanceRequested` applied in one unit, when the same two effects are
applied again in a new unit, then there is one invitation and two effect rows.
test: `backend/padel_app/tests/test_pad916_engine_store.py` › `test_an_effect_applied_twice_is_written_once`

#### NOTIFICATIONS-ENGINE-STORE-2: The outbox sends each message once (rule 2)
Given two `Invited`, one `Message` and one `Answered` applied, when `dispatch` runs twice, then the first
run sends three rows (the two invitations and the message), the second sends none, and the `Answered`
is never sent.
test: `backend/padel_app/tests/test_pad916_engine_store.py` › `test_the_outbox_sends_each_message_once`

#### NOTIFICATIONS-ENGINE-STORE-3: Levels reach the engine as ladder positions (rule 4)
Given a coach's ladder with `display_order` 10 and 30 and a student holding another coach's level, when
the store builds a snapshot, then the two levels are positions 1 and 2, the other coach's level is none,
and each student's `subscription_status` is their account's status.
test: `backend/padel_app/tests/test_pad916_engine_store.py` › `test_levels_reach_the_engine_as_ladder_positions`

#### NOTIFICATIONS-ENGINE-STORE-4: The coach's approval round-trips through the store (rule 5)
Given a session, when the store applies in turn an `ApprovalRequest` for group 1, a `GroupApproved`
removing one student, a request for group 2, a `GroupDismissed` for it, a `GroupReopened` for it, a third
request for group 2, a `GroupApproved` removing another a request for group 3 and an `ApprovalWithdrawn` for it,
then after each the snapshot's approval state is as rule 5 says (approved groups 1 and 2 at the end,
removed holding both students; the dismissal keeps the spot counts it saw), and `dispatch` sends each
request once.
test: `backend/padel_app/tests/test_pad916_engine_store.py` › `test_the_coachs_approval_round_trips_through_the_store`

#### NOTIFICATIONS-ENGINE-STORE-5: A student the system recorded as coming counts as confirmed (rule 6)
Given a new-engine class created after its reminder time, its students recorded as coming by the system,
when the store builds the snapshot and the attendance request falls due, then they are confirmed and
nobody is asked.
test: `backend/padel_app/tests/test_pad916_engine_store.py` › `test_a_student_the_system_recorded_as_coming_counts_as_confirmed`

#### NOTIFICATIONS-ENGINE-STORE-6: The tick plans each session on its own and goes on past a failure (rule 7)
Given three new-engine sessions, the second made to raise, when `engine_tick` runs, then the first and
third are planned and committed, the second's unit is rolled back, and one failure is recorded for it.
test: `backend/padel_app/tests/test_pad918_engine_tick.py` › `test_the_tick_plans_each_session_and_goes_on_past_a_failure`

#### NOTIFICATIONS-ENGINE-STORE-7: An invitation's live bubble follows its state, once per change (rule 8)
Given an invitation with its first bubble, when the store applies a sorry, a reopening from the waiting
list (a second bubble), then `withdraw`, then the first bubble goes `open` → `sorry` → `reopened` and stays
there, the second goes `open` → `withdrawn`, `closed_reason` is `withdrawn`, `reopened_at` is set, and each
change publishes one `message_edited` per message it changed, after commit.
test: `backend/padel_app/tests/test_pad916_engine_store.py` › `test_every_message_of_an_invitation_follows_its_state`

#### NOTIFICATIONS-ENGINE-STORE-8: An AlertCleared drops the alert (rule 8)
Given a session holding an alert for a right type, when the store applies `AlertCleared` for it, then the
session holds no alert for that type and a later alert for it is raised again.
test: `backend/padel_app/tests/test_pad916_engine_store.py` › `test_an_alert_cleared_drops_the_alert`

#### NOTIFICATIONS-ENGINE-STORE-9: The snapshot carries each session's end, from the lesson's duration (rule 4)
Given a 90-minute lesson's occurrence at 18:00 and a student going to it, when the store builds the
snapshot of the same coach's 19:00 session, then the student is busy at that time, the other session
running to 19:30.
test: `backend/padel_app/tests/test_pad916_engine_store.py` › `test_the_snapshot_carries_each_sessions_end`

#### NOTIFICATIONS-ENGINE-STORE-10: A no-show stays placed; a coach's absent mark before the class frees the spot (rule 4)
Given a full session, when a regular is a no-show and another is marked absent by the coach after the
start, then both are still going in the snapshot and the roster stays full; when a third is marked absent
by the coach before the start, then they are not going and their spot is open.
test: `backend/padel_app/tests/test_pad916_engine_store.py` › `test_a_no_show_stays_placed`

#### NOTIFICATIONS-ENGINE-STORE-11: A coach's accept or add reaches the engine with its side (rule 9)
Given a new-engine session of 10 with 4 left and 4 right going, when the coach accepts a left join request,
then the accepted student's presence has `assigned_side` left and the engine's open spot types are a right
`must` only; when the coach adds a student whose side for that session is right, then their
`assigned_side` is right; and a `both` request passes no side.
test: `backend/padel_app/tests/test_pad808_coach_add_side.py` › `test_a_coachs_accept_or_add_reaches_the_engine_with_its_side`

### Waves
1. (PAD-916) STORE-1 to STORE-5, STORE-7, STORE-8 — `padel_app/services/engine_store.py` (content keys, the outbox,
   `dispatch`); `ApprovalRequest` joins the outbox with `notifications.engine-planning` wave 6.
2. (PAD-916) STORE-9, STORE-10 — `padel_app/services/engine_store.py` (each session's end; what going means).
3. (PAD-808) STORE-11 — `services/engine_entry.py` (`coach_added` passes the side), the accept and the class edit; with engine-answers ANSWERS-32.

### Open questions
- None.
