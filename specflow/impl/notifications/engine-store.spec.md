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
- **WRITES at adoption and on a placement:** the adopted occurrence's presences (rule 10); a standing
  waiting-list entry's credits and its class rows (`StandingWaitingListEntry`, `WaitingListEntry`, rule 11).

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
   that fails every level rule, for a class it applies none (`notifications.engine-tiers` rule 13). The class's
   level is the occurrence's effective level: its own when set, else its lesson's default level
   (`LessonInstance.effective_level_id`, `classes.edit` rule 4), at adoption and in every snapshot; an
   occurrence that inherits its level is never handed to the engine as a class with no level. A student's `subscription_status` is their
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
   Each run logs one line at INFO when it ends: its duration in milliseconds, each pass's duration, and
   how many occurrences it materialised and adopted, sessions it listed, effects it applied and outbox
   rows it sent, so a run that outgrows const:ENGINE_RUN_EVERY shows in the log.
   A listed session with nothing due costs one snapshot per run (a step that applied no effect leaves the
   session as it was, so the next step reads the same snapshot), and what a snapshot reads does not grow
   with the coach's past classes or with other coaches' classes: the coach's occurrences are asked about
   inside the queries that count a student's history, never fetched as a list, and the overlap and
   elsewhere reads ask only about the occurrences they found.

8. **Invitation messages and alerts stay current** (`notifications.invitations` NB1a;
   `notifications.engine-planning` rule 11). The store keeps each invitation's message ids, its
   `closed_reason` (`withdrawn` | `same_hour` | `class_removed`) and `reopened_at`, writes the invitation's state (`open`, `answered` with `response`
   and `answeredBy`, `sorry`, `reopened`, `withdrawn`, `closed_same_hour`) and `startsAt`/`countsUntil`
   on its live messages: every attached message until the invitation is reopened; from then the older
   bubbles keep `reopened` and later states land only on the newest bubble, the one with live buttons. It
   publishes one `message_edited` per message after the commit. A
   withdrawal is the store's own `withdraw(invitation_id, at)`, which rule 19's route calls; it is no
   engine effect. An `AlertCleared` drops that alert.

9. **The side of a coach's add (PAD-808, `classes.join-requests` NJ4; `notifications.engine-answers`
   rule 10).** The app hands the engine `CoachAdded(student, side, firm)` with the side the app knows:
   - for an accepted join request, the request's side, firm (`left`/`right`; `both` passes none);
   - for the coach's add to the class, `presences.side` only when the row already has one (a re-add of
     a presence that kept the side the coach set for that session, PAD-551), firm; otherwise none, and
     the engine places a one-sided student on their side;
   - for an old invitation's Yes on a new-engine session (`notifications.manual` NM3), the old
     vacancy's side when it named one, not firm.
   On a new-engine session the coach's per-session side (`presence_side_service`, PAD-551) reaches the
   engine as `CoachSetsSide(student, side)` after that change's own commit, instead of the old engine's
   re-count. If that call fails, the change stands and the coach's request still succeeds (the failure
   is logged and the engine's part rolled back): at the start of each unit of a session, the store
   writes a going presence's `side`, when it is `left` or `right` and differs from its `assigned_side`,
   as its `assigned_side`, so the engine's next run counts the coach's side, firm. An engine placement
   (`Placed`) on a side other than the presence's set `side` clears that `side`: it was the coach's choice
   for an earlier stay (a cancelled one), not this placement, so neither the start-of-unit write nor
   firmness overrides the engine's own placement. Clearing the side
   tells the engine nothing, and the placement is then no longer firm: `last_invite_at` may move a
   student who plays both sides. A firm `SideAssigned` is written as both the presence's
   `assigned_side` and `presences.side`, so `sides_in_occurrence` and every other reader agree with the
   engine; any `SideAssigned` writes `assigned_side`. The snapshot's placement is firm when the
   presence's `side` is `left` or `right` and is the side it holds.
10. **Adoption takes the occurrence's people as the old engine left them (`notifications.config` rule 18;
    owner, 2026-11-19: what was on the old engine is kept at the switch).** When the store adds a session
    the old engine knew, nobody is enrolled again and nobody's answer is reset:
    - a going roster presence is a regular, placed on their side (as before);
    - an absent roster presence (the regular's own No, or the coach marking them absent, before the class)
      is the regular's absence as rule 4 reads it: the store writes `left_reason` `regular_no` and keeps
      its `status`, `response`, `responded_at`, `justification` and the coach's validation as they are.
      The regular stays a regular, their seat is free, and the engine plans it like any regular's No:
      being absent, they are not going, so the engine's attendance requests never ask them again;
    - an absent presence that is not the roster's (a student placed for that one class who cancelled) is a
      cancellation: `left_reason` `cancel`, not going, the seat free;
    - the class's waiting-list rows (standing or not) and its pending join requests stay as they are; the
      engine reads the active rows as its lists.
    The old engine's unstarted vacancies close (`notifications.config` rule 18); the spot one stood for is
    the free seat above, now the engine's.
11. **A placement from a standing row spends its credit (`notifications.waiting-list` rules 15 and 15a on a
    new-engine session).** When the store writes a `Placed` that is not a regular's (`invitation`, `direct`
    or `auto_from_waiting_list`) for a student whose active row on the session's waiting list was fanned out
    by a standing entry (`standing_entry_id`), that entry spends one credit in the same unit. When its
    credits are used up (`credits_total` not NULL) the entry closes, and so do its other active class rows.
    A NULL limit never runs out and never closes. An effect applied again spends nothing (rule 1). The
    coach accepting a join request spends on its own path (`classes.join-requests` rule 8) and reaches the
    engine as `CoachAdded`, which writes no `Placed`, so that credit is spent once. Waiting-list rule 15b
    (the last credit withdraws the student's other open offers) is not done on the new engine; see Open
    questions.
12. **State stored before the class had its level keeps its meaning (engine effective level, 2026-11-25;
    lead's decision).** A session adopted while the store still handed the engine an inherited class as
    having no level (before rule 4's effective level) holds spot types stored with no level: its coach
    alerts (`alerted`), its pending approval requests' queues (`pending`) and its dismissed groups' spot
    counts (`dismissed_groups`). The store reads such a stored spot type as the session's current level, so
    a deploy of rule 4 raises no alert again, reopens no dismissed group and asks for no approval again on
    that account; an alert cleared or raised again replaces the one stored with no level. The same reading
    holds outside the snapshot: an approval request's card built from its queued outbox row, and the admin
    engine-health's coverage of open spots by stored invitation offers. It also holds for a class that had no
    level and is later given one: its no-level state reads at the new level, so nothing reopens or is asked
    again, while a change from one level to another does reopen and re-ask as before. A class with no level
    reads exactly as before. No stored row is rewritten by a migration.

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

#### NOTIFICATIONS-ENGINE-STORE-11: A coach's accept or re-add reaches the engine with its side (rule 9)
Given a new-engine session of 10 with 4 left and 4 right going, when the coach accepts a left join request
from a student who plays both sides, then their presence has `assigned_side` and `side` left, the
placement is firm and the engine's only open spot type is one right `must`; a `both` request passes no
side; and when the coach adds a student who plays both sides, sets their side for the session to right,
the student cancels and the coach adds them again through the class edit, then they are going on the
right, firm.
test: `backend/padel_app/tests/test_pad808_coach_add_side.py` › `test_a_coachs_accept_or_add_reaches_the_engine_with_its_side`

#### NOTIFICATIONS-ENGINE-STORE-12: The coach's per-session side and an old invitation's Yes reach the engine (rule 9)
Given a new-engine session with a going student who plays both sides placed left, when the coach sets
their side for the session to right (PAD-551), then their `assigned_side` is right, the placement is firm,
the old engine's re-count does not run and no message is sent; and when a student who plays both sides
says Yes to an old-engine invitation for a right vacancy of a session now on the new engine (NM3), then
their `assigned_side` is right and the placement is not firm.
test: `backend/padel_app/tests/test_pad808_coach_add_side.py` › `test_the_coachs_session_side_and_an_old_yes_reach_the_engine`

#### NOTIFICATIONS-ENGINE-STORE-13: A failed engine call on the coach's per-session side heals on the next unit (rule 9)
Given a new-engine session with a going student who plays both sides placed left, firm, when the coach sets
their side for the session to right and the engine's call raises, then the request still returns the
presence with `side` right, the engine's `assigned_side` is still left, and the session's next unit (a
planning run) has `assigned_side` right and counts the student on the right, firm.
test: `backend/padel_app/tests/test_pad808_coach_add_side.py` › `test_a_failed_engine_call_on_the_coachs_side_heals_on_the_next_unit`

#### NOTIFICATIONS-ENGINE-STORE-14: An engine placement on another side clears a stale per-session side (rule 9)
Given a new-engine session where a student who plays both sides joined by an accepted left request and then
cancelled, when the engine places them on the right (a direct join), then their `side` is cleared,
`assigned_side` is right, the placement is not firm, and a later unit leaves them on the right.
test: `backend/padel_app/tests/test_pad808_coach_add_side.py` › `test_an_engine_placement_on_another_side_clears_a_stale_session_side`

#### NOTIFICATIONS-ENGINE-STORE-15: A regular's early No survives the switch and its seat is the engine's (rule 10)
Given a coach on the old engine and a future class whose invitations have not started, whose regular said No
(absent, not validated, response kept) and whose old vacancy is open and never sent, when the coach is
switched, then the class is on the new engine, the regular's presence is still absent with the same response
and justification and `left_reason` `regular_no`, the vacancy is expired, the engine's snapshot counts the
regular absent and not going, the engine's first run once the window opens invites another student for
that seat, and none of the engine's runs up to the class sends the regular an attendance request (no
`AttendanceRequested` effect and no attendance-request row for them).
test: `backend/padel_app/tests/test_switch_keeps_lists.py` › `test_a_regulars_early_no_survives_the_switch`

#### NOTIFICATIONS-ENGINE-STORE-16: The coach's recorded absence is kept as recorded at the switch (rule 10)
Given a future class whose regular the coach marked absent before the class (validated, with a
justification), when the coach is switched, then the presence keeps `status` absent, `validated` true and
its justification, reads as the regular's absence (`left_reason` `regular_no`), and the regular is not going.
test: `backend/padel_app/tests/test_switch_keeps_lists.py` › `test_the_coachs_recorded_absence_is_kept_at_the_switch`

#### NOTIFICATIONS-ENGINE-STORE-17: A one-off student's cancellation and the class's lists survive the switch (rule 10)
Given a future class with a student placed for that class only who cancelled (absent, not on the roster), a
standing entry's row and a student's own row on its waiting list, and a pending join request, when the coach
is switched, then the cancelled student reads `left_reason` `cancel` and is not going, both waiting-list rows
are active and in the engine's snapshot, and the join request is pending.
test: `backend/padel_app/tests/test_switch_keeps_lists.py` › `test_a_cancellation_and_the_classs_lists_survive_the_switch`

#### NOTIFICATIONS-ENGINE-STORE-18: A Yes from a standing row spends its credit; the last one closes the entry (rule 11)
Given a new-engine session with a student on its waiting list through a standing entry with one credit left
and an active row in another class, when the engine invites them and they say Yes, then they are going, the
entry has spent the credit and is closed, and its row in the other class is closed; and applying the same
`Placed` again spends nothing more.
test: `backend/padel_app/tests/test_switch_keeps_lists.py` › `test_a_yes_from_a_standing_row_spends_its_credit`

#### NOTIFICATIONS-ENGINE-STORE-19: Automatic entry spends a credit, a NULL limit never runs out, a coach's accept spends once (rule 11)
Given new-engine sessions, when automatic entry places a student from a standing row with two credits, then
one is spent and the entry stays open; when a student whose standing entry has no limit is placed from its
row, then `credits_used` grows and the entry stays open; and when the coach accepts the join request of a
student holding a standing row with two credits, then exactly one credit is spent.
test: `backend/padel_app/tests/test_switch_keeps_lists.py` › `test_automatic_entry_no_limit_and_a_coachs_accept_spend_as_rule_11_says`

#### NOTIFICATIONS-ENGINE-STORE-20: Each run logs its duration and counts (rule 7)
Given a switched coach with one listed session, when `engine_tick` runs, then one INFO line is logged
with the run's total milliseconds, each pass's milliseconds, and the materialised, adopted, sessions,
effects and sent counts.
test: `backend/padel_app/tests/test_engine_tick_load.py` › `test_each_run_logs_its_duration_and_counts`

#### NOTIFICATIONS-ENGINE-STORE-21: A session with nothing due reads a bounded amount, whatever the history (rule 7)
Given switched coaches with listed sessions and nothing due, when the sessions' tick runs with 4 weeks of
past classes (with presences), and again after 26 more weeks of them and another coach's classes with 30
weeks of history, then each session is snapshotted once, takes at most 40
statements, and both runs issue the same statements, load the same ORM rows and bind the same largest
parameter list.
test: `backend/padel_app/tests/test_engine_tick_load.py` › `test_a_session_with_nothing_due_reads_a_bounded_amount_whatever_the_history`

#### NOTIFICATIONS-ENGINE-STORE-22: An occurrence with no level of its own takes its lesson's default level (rule 4)
Given a coach with level-based groups (the class's level first, one level away second) and an occurrence whose own
`level_id` is NULL and whose lesson's default level is set, when the coach is switched (adoption) and the store
builds the session's snapshots, then the level adoption hands `add_session` and the level of every snapshot are the
lesson's default level's ladder position (not none), and a student one level away from it is invited in the second
group, after the same-level students, not with them.
test: `backend/padel_app/tests/test_engine_effective_level.py` › `test_an_inherited_level_reaches_the_engine_at_adoption_and_in_every_snapshot` (+ `test_an_inherited_level_keeps_the_level_groups_in_order`, `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P47-an-inherited-class-level-keeps-the-level-groups]`)

#### NOTIFICATIONS-ENGINE-STORE-23: Spot types stored with no level read as the session's level (rule 12)
Given an adopted session whose occurrence inherits its class's level, holding a coach alert, a dismissed group's
spot counts and a pending approval request's queues all stored with no level and otherwise current, when the
store builds its snapshot and the engine decides, then it raises no `CoachAlert` and no `AlertCleared`, emits no
`GroupReopened` and no new `ApprovalRequest`; and when the alert is raised again for a new count, the entry
stored with no level is replaced, not kept beside it.
test: `backend/padel_app/tests/test_engine_effective_level.py` › `test_state_stored_with_no_level_reads_as_the_sessions_level`

#### NOTIFICATIONS-ENGINE-STORE-24: An approval card and the admin coverage read a stored no-level spot type as the session's level (rule 12)
Given an adopted session whose occurrence inherits its class's level, when an approval request's outbox row
queued with spot types of no level is turned into its card, then the card is the one the same queues at the
session's level give (each type's open count and level label); and when admin engine-health counts the open
spots an open counting invitation offered with no level covers, then it counts them as it does for the same
offer at the session's level.
test: `backend/padel_app/tests/test_engine_effective_level.py` › `test_the_card_and_the_admin_coverage_read_a_no_level_spot_type_at_the_sessions_level`

### Waves
1. (PAD-916) STORE-1 to STORE-5, STORE-7, STORE-8 — `padel_app/services/engine_store.py` (content keys, the outbox,
   `dispatch`); `ApprovalRequest` joins the outbox with `notifications.engine-planning` wave 6.
2. (PAD-916) STORE-9, STORE-10 — `padel_app/services/engine_store.py` (each session's end; what going means).
3. (PAD-808) STORE-11 to STORE-14 — `services/engine_entry.py` (`coach_added`, `coach_sets_side`), `services/engine_store.py`
   (`SideAssigned.firm`, the placement's firmness), `presence_side_service.py`, NM3's `_tell_new_engine_placed`; with
   engine-answers ANSWERS-32.
4. (switch keeps lists, 2026-11-19) STORE-15 to STORE-17 — `services/engine_switch.py` (`_adopt`) and
   `services/engine_store.py` (`add_session`); STORE-18, STORE-19 — `services/engine_store.py` (`Placed`).
5. (engine tick load, 2026-11-25) STORE-20 — `services/engine_runner.py` (`run_tick`'s log line); STORE-21 —
   `invitation_engine/engine.py` (`tick`), `services/engine_store.py` (`_students`, `_overlapping_going`,
   `_elsewhere`), `services/lesson_service.py` (`coach_instance_ids`, `coach_instance_ids_select`).
6. (engine effective level, 2026-11-25) STORE-22 — `services/engine_store.py` (`snapshot`) and
   `services/engine_switch.py` (`_adopt`).
7. (engine effective level, transition) STORE-23 — `services/engine_store.py` (`snapshot`'s reading of `alerted`,
   `pending`, `dismissed_groups`; `CoachAlert` and `AlertCleared` writes).
8. (engine effective level, transition readers) STORE-24 — `services/engine_outbox.py` (`card`),
   `services/admin/engine_health.py` (`_open_spots`).

### Open questions
- A stale `presences.side` after a cancel (rule 9) — left as is (lead, 2026-11-14): a student who joined
  by an accepted request for a side, cancelled, and is placed again by the engine on that same side reads
  firm, so `last_invite_at` never moves them. Rare, and clearing `presences.side` on every engine
  placement is a wider change than PAD-808.
- Waiting-list rule 15b on the new engine (rule 11) — out of the switch fix (lead, 2026-11-19), for the
  owner, who confirmed 15b on 2026-10-21: when a Yes spends a standing entry's last credit, should the
  student's other open engine invitations paid by that entry be withdrawn? The engine never revokes (D4),
  and a withdrawal needs its own bubble state and copy. Until then a second Yes from that entry places the
  student without a credit.
- The run's log line (rule 7, STORE-20; prod slowness, 25 Nov 2026) — decision (hotfix agent, owner's
  order, nobody reachable to review; the owner can reverse it): a log line only, not exposed on admin
  engine-health, because APScheduler logs no run lines and the log is the cheapest place to read it.
- The sessions' tick's cost (rule 7, STORE-21; prod 25 Nov 2026: about 110 statements and three snapshots
  per listed session, full reads of the coach's history per snapshot) — decision (hotfix agent, owner's
  order relayed by the coordinator to widen the fix, nobody reachable to review; the owner can reverse
  it): reuse the snapshot when a step applied nothing, and scope the history reads in SQL. This touches
  `Engine.tick` (`notifications.engine-planning`'s run) without changing what it decides.
