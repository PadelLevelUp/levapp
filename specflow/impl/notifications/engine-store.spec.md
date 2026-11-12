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
   account's `User.status`.
5. **The store keeps each session's approval state as the engine's effects leave it** (semi-automatic
   mode, `notifications.engine-planning` rule 14), in the session's row (`engine_sessions`: approved,
   removed, pending, dismissed): `ApprovalRequest` sets the pending queues and ends a dismissal;
   `QueueApproved` replaces the approved queue, adds to the removed students and ends the request;
   `QueueDismissed` ends the request and keeps the spot counts it saw; `QueueReopened` ends the
   dismissal; `ApprovalWithdrawn` ends the request. Each `ApprovalRequest` is sent once (rule 2).
6. **Who has confirmed.** The snapshot's confirmed students are those whose attendance request was
   answered yes (`ReminderAttempt`) and those whose presence answer is `confirmed`, whoever recorded it
   (`notifications.reminders` rule 22: a class created after its reminder time counts its students as
   coming).

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
Given a session, when the store applies in turn an `ApprovalRequest`, a `QueueApproved` removing one
student, a second request, a `QueueApproved` removing another, a `QueueDismissed`, a `QueueReopened` and
an `ApprovalWithdrawn`, then after each the snapshot's approval state is as rule 5 says (removed holds
both students after the second approval; the dismissal keeps the spot counts it saw), and `dispatch`
sends each request once.
test: `backend/padel_app/tests/test_pad916_engine_store.py` › `test_the_coachs_approval_round_trips_through_the_store`

#### NOTIFICATIONS-ENGINE-STORE-5: A student the system recorded as coming counts as confirmed (rule 6)
Given a new-engine class created after its reminder time, its students recorded as coming by the system,
when the store builds the snapshot and the attendance request falls due, then they are confirmed and
nobody is asked.
test: `backend/padel_app/tests/test_pad916_engine_store.py` › `test_a_student_the_system_recorded_as_coming_counts_as_confirmed`

### Waves
1. (PAD-916) STORE-1 to STORE-5 — `padel_app/services/engine_store.py` (content keys, the outbox,
   `dispatch`); `ApprovalRequest` joins the outbox with `notifications.engine-planning` wave 6.

### Open questions
- None.
