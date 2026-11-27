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
13. **An attendance request's answer reaches the presence (`notifications.reminders`, `event-detail` rule
    24; as the old engine's reminder answer did).** When the store writes an `Answered` yes to an attendance
    request, the student's going presence is written as coming: `confirmed`, `response` `confirmed` and
    `responded_at` the answer's time, and one `presence_changed` live event is queued for the class's coach,
    sent after the unit commits (none on a rollback). A yes the engine already
    counts (rule 6: a yes `ReminderAttempt`) has no effect, so the app's answer route, when the engine returns
    no `Answered` for a going student who has a yes `ReminderAttempt` and whose presence is not written as
    coming, has the store write it as above, in its own unit, before the class starts: a presence an earlier
    yes left unwritten is repaired by the student's next tap. Who the engine counts as confirmed (rule 6) and
    who it asks again do not change.
14. **A No and "Afinal vou" reach the presence (`attendance.confirm` rules 28-29, `event-detail` rule 24;
    as the old engine's did).** A `Left` (a regular's No, a cancellation, the reminder's No) queues one
    `presence_changed` for the class's coach, sent after the commit; the No's own fields stay as rule 4,
    the `Absence` and owner ruling D4 write them (`status` `absent`, the notice as `response`, never a
    justification). A regular's "Afinal vou" (`RegularReturns`) that the engine places (`Placed`
    `regular_returns`) writes the presence as coming as the old path's return did: the coach's "Não vai"
    mark cleared (`validated` false), `confirmed`, `response` `confirmed` and `responded_at` the placement's
    time, and one `presence_changed`; so they count as confirmed (rule 6) and are not asked again for that
    occurrence (`attendance.confirm` rule 28); the coach is told as rule 16 says. When the engine places nobody (the regular's side is full: a
    "sorry" only), the answer route answers `spot_filled` and nothing on the presence changes. A student who
    is not a regular and said No or cancelled returns through rule 15 (the owner, 26 Nov 2026). A
    `spot_filled` changes nothing on the presence, its block-decline reason (`decline_source`) included.
    Neither rule 13's write nor its repair touches a presence the coach already marked (`validated`,
    `attendance.confirm` rule 29, as the old path's `already_marked`) or one that is `absent`: its
    `confirmed`, `response` and `recorded_by` stay as they were.
15. **A non-regular's "Afinal vou" takes a free place (the owner, 26 Nov 2026: "Let's fix it. We should
    only show afinal vou if there's still places left."; `notifications.engine-answers` rule 16,
    `attendance.confirm` rules 28 and 32; as the old path's `_retake_spot` did).** The answer route
    (`respond_reminder` with `yes`, `engine_entry.answer_attendance_request`) sends a student who is not a
    regular and whose presence is `absent` by their own cancellation or No (`left_reason` `cancel`) to the
    engine as `Returns(student)`; a regular still goes as `RegularReturns` (rule 14). The engine decides
    under the session's lock, so the free place is re-read at the tap, never taken from the screen.
    - **Placed** (`Placed` `returns`): the store writes the presence as coming, as rule 14 does for a
      regular: `status`, `justification`, `left_reason` cleared, `validated` false (a coach's "Não vai"
      goes with it), `confirmed`, `response` `confirmed`, `responded_at` the placement's time,
      `decline_source` cleared, `enrolment_source` `fill` (the student stays a one-class student; never
      `roster`), `placed_how` `returns`, `assigned_side` the engine's side; one `presence_changed` for the
      class's coach after the commit, and the coach is told as rule 16 says. The answer is
      `{"action": "confirmed"}`. **No standing credit is spent:** the credit was spent when the student
      was first placed from a standing row (rule 11), and a return is not a new placement from that row.
    - **Not placed** (no free place on a side they play, placed elsewhere at the same hour, or a place
      that went between the screen and the tap): the answer is `{"action": "spot_filled"}` and nothing on
      the presence, the reminder attempt or the waiting lists changes. App Store builds that still show the
      button on a full class get this honest answer and their existing "A tua vaga já foi ocupada" line.
    - **Who is asked again:** nobody new. The returning student is confirmed and gets no attendance
      request for the occurrence; the place they took is no longer open, so the planner sends no new
      invitation for it; open invitations for it stay open (`notifications.engine-planning` rule 10)
      and their Yes gets the sorry. A pending approval request whose group has no open place left is the
      planner's to withdraw (`ApprovalWithdrawn`, rule 5) on its next run, as after any other placement.
    - A repeat tap after a placement answers `{"action": "confirmed", "duplicate": true}` (the presence is
      no longer absent; rule 13's path).
16. **Every return tells the coach (the owner, 26 Nov 2026: "Yes let's send the notification letting the
    coach know the player will come after all."; `attendance.confirm` rule 28's "The coach is told", as
    the old path's `_notify_coach_of_return` did).** When the store applies a `Placed` with `how`
    `regular_returns` (rule 14) or `returns` (rule 15), it queues, after the unit commits (none on a
    rollback), the old path's notice: a message from the student to the class's coach in their shared
    conversation, "<name> afinal vai a <class><when>." / "<name> is coming to <class><when> after all."
    (the coach's locale; real name, `players.nickname` rule 4; `msg_metadata` `comeBack` true and
    `lessonInstanceId`), one `message_created`, and one push to the coach (web push and Expo, title "Afinal
    vai" / "Coming after all", body naming the student by the coach's display name, `players.nickname`
    rule 9c). One placement sends it once: a retried apply (rule 1) or a repeat tap (`duplicate`) sends
    nothing more. A return the engine does not place (`spot_filled`) sends nothing to the coach. No
    `reminder_confirmed` template goes to the student (`attendance.confirm` rule 28).

17. **A session whose notifications are off is never planned, on any path (owner, 27 Nov 2026: "the new
    engine sends nothing for a class whose notifications are off, same rule as the old engine").** The
    switches are the ones the tick's listing reads (`notifications.config` rule 19: the coach's
    `autoNotifyEnabled`, the class's `notifications_enabled`, and the class's effective `auto_invites`,
    NULL inheriting by the lesson's type, a private lesson off; a coach with no stored row reads as off,
    as in the listing). The store answers whether a session plans (`plans`) from one predicate that
    `sessions()` uses too, so the tick and the request paths never read the switches differently. While
    any switch is off, no run plans the session: not a student's request (a No, a cancellation, a return,
    a confirmation, an invitation's answer, a waiting-list join or leave), not the coach's add, side,
    exclusion or semi-automatic answer, not a class edit's or a config save's re-plan. So no automatic
    invitation, re-offer, waiting-list invitation, automatic entry from a waiting list, coach alert or
    approval request goes out for it. The request's own effects still land: the absence and the freed
    seat, the answer recorded, a Yes to an invitation sent before the switch went off placed (or its
    "sorry"), and the replies to the acting student. The coach's own sends by hand still go: an invitation
    by hand (`notifications.engine-answers` rule 15) and the attendance request by hand
    (`notifications.engine-timeline` rule 8).

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

#### NOTIFICATIONS-ENGINE-STORE-25: A yes to the attendance request confirms the presence and tells the coach (rule 13)
Given a new-engine class with its regular going and unconfirmed, when the regular answers yes to the
attendance request, then their presence is `confirmed` with `response` `confirmed` and `responded_at` the
answer's time, their `ReminderAttempt` is answered yes, and one `presence_changed` for them reaches the
class's coach after the commit.
test: `backend/padel_app/tests/test_engine_reminder_yes_presence.py` › `test_a_yes_to_the_attendance_request_confirms_the_presence`

#### NOTIFICATIONS-ENGINE-STORE-26: A repeat yes repairs a presence an earlier yes left unconfirmed (rule 13)
Given a new-engine class whose regular has a yes `ReminderAttempt` and a going presence that is not
confirmed (`response` `none`), when the regular answers yes again, then the engine returns no effect, and
the presence is `confirmed` with `response` `confirmed`, and one `presence_changed` reaches the coach after
the commit; a repeat yes once the class has started repairs nothing.
test: `backend/padel_app/tests/test_engine_reminder_yes_presence.py` › `test_a_repeat_yes_repairs_an_unconfirmed_presence`

#### NOTIFICATIONS-ENGINE-STORE-27: The student's in-app yes confirms the presence (rule 13)
Given a new-engine class with its regular going and unconfirmed, when the regular posts yes to
`/api/app/notify/respond_reminder` (the reminder bubble's and the class detail's confirm button), then the
answer is `confirmed` and the presence is `confirmed` with `response` `confirmed`.
test: `backend/padel_app/tests/test_engine_reminder_yes_presence.py` › `test_the_in_app_yes_confirms_the_presence`

#### NOTIFICATIONS-ENGINE-STORE-28: A No to the attendance request and a cancellation tell the coach (rule 14)
Given a new-engine class with its regular going, when the regular answers no to the attendance request,
then the presence is `absent` with the notice as its `response` (`cancelled` inside the cancellation
deadline) and no justification, and one `presence_changed` for them reaches the class's coach after the
commit; and when a student placed for that one class cancels, one `presence_changed` for them reaches the
coach too.
test: `backend/padel_app/tests/test_engine_afinal_vou_presence.py` › `test_a_no_and_a_cancellation_tell_the_coach`

#### NOTIFICATIONS-ENGINE-STORE-29: A regular's "Afinal vou" with a spot lands on coming (rule 14)
Given a new-engine class whose regular said No, when the regular answers yes, then the answer is
`confirmed`, the presence is going with `confirmed`, `response` `confirmed` and `responded_at` the answer's
time, the snapshot counts them confirmed, and one `presence_changed` reaches the coach; and given the same
regular marked "Não vai" by the coach (`validated`) before the class, their yes also clears `validated`, so
the state reads `coming`.
test: `backend/padel_app/tests/test_engine_afinal_vou_presence.py` › `test_a_regulars_return_with_a_spot_lands_on_coming`

#### NOTIFICATIONS-ENGINE-STORE-30: A regular's "Afinal vou" on a full side answers spot_filled (rule 14)
Given a new-engine class whose regular said No and whose seat was then taken, when the regular answers yes,
then the answer is `spot_filled` and the presence stays `absent` with its `response` and its
`decline_source` unchanged.
test: `backend/padel_app/tests/test_engine_afinal_vou_presence.py` › `test_a_regulars_return_on_a_full_side_answers_spot_filled`

#### NOTIFICATIONS-ENGINE-STORE-31: A non-regular's "Afinal vou" with no free place on their side answers spot_filled, never confirmed (rules 14, 15)
Given a new-engine class where a left-only student placed for that one class cancelled and the left side was
then filled, when they answer yes, then the answer is `spot_filled` and the presence stays `absent` with its
`response` and `decline_source` unchanged.
test: `backend/padel_app/tests/test_engine_afinal_vou_presence.py` › `test_a_non_regulars_return_with_no_place_answers_spot_filled`

#### NOTIFICATIONS-ENGINE-STORE-32: A yes never writes over the coach's mark (rule 14)
Given a new-engine class whose regular the coach marked present (`validated`) before the start, when the
regular answers yes, and again (the repair), then the presence's `confirmed`, `response` and `recorded_by`
are as the coach's mark left them.
test: `backend/padel_app/tests/test_engine_afinal_vou_presence.py` › `test_a_yes_never_writes_over_the_coachs_mark`

#### NOTIFICATIONS-ENGINE-STORE-33: An attendance-request yes is never written on an absent presence (rule 14)
Given a new-engine class whose regular said No, when the store applies an `Answered` yes to the attendance
request for them, then the presence stays `absent` with its `confirmed` and `response` unchanged.
test: `backend/padel_app/tests/test_engine_afinal_vou_presence.py` › `test_an_answered_yes_is_never_written_on_an_absent_presence`

#### NOTIFICATIONS-ENGINE-STORE-34: A non-regular's "Afinal vou" with a free place lands on coming, spends no credit (rule 15)
- **Given** a new-engine class of 4 where Rui, placed for that one class from a standing waiting-list row
  with one credit left, cancelled; a left place is free and Bia holds an open invitation offering it
- **When** Rui posts `yes` to `/api/app/notify/respond_reminder`
- **Then** the answer is `{"action": "confirmed"}`; his presence is going with `confirmed`, `response`
  `confirmed`, `responded_at` the answer's time, `enrolment_source` `fill`, `placed_how` `returns`,
  `assigned_side` left, `validated` false and no `decline_source`; the snapshot counts him confirmed and
  the engine sends him no attendance request; his standing entry's `credits_used` is unchanged; one
  `presence_changed` for him reaches the coach after the commit; Bia's
  invitation is still open
- **And** a second `yes` answers `{"action": "confirmed", "duplicate": true}` and writes nothing
test: `backend/padel_app/tests/test_engine_afinal_vou_presence.py` › `test_a_non_regulars_return_with_a_place_lands_on_coming`

#### NOTIFICATIONS-ENGINE-STORE-35: A place that went between the screen and the tap answers spot_filled (rule 15)
- **Given** a new-engine class whose student who is not a regular cancelled, served `comeBack` `rejoin`
  while one place was free, and another student then placed in that place
- **When** the student posts `yes` (an old build's button, or a screen not yet refreshed)
- **Then** the answer is `{"action": "spot_filled"}` and the presence, the reminder attempt and the waiting
  lists are unchanged; and of two such students posting `yes` at the same moment for the last place
  (Postgres), exactly one is `confirmed` and the class is never over capacity
test: `backend/padel_app/tests/test_engine_afinal_vou_presence.py` › `test_a_place_that_went_before_the_tap_answers_spot_filled` (+ `backend/padel_app/tests/test_engine_afinal_vou_presence_pg.py` › `test_two_returns_race_for_the_last_place`)

#### NOTIFICATIONS-ENGINE-STORE-36: A regular's and a non-regular's return each tell the coach once (rule 16)
- **Given** a new-engine class with a free place, a regular who said No and a student placed for that class
  only who cancelled
- **When** each posts `yes` to `/api/app/notify/respond_reminder`, and each posts it again
- **Then** after each first answer's commit the coach's conversation with that student gains one message from
  the student, "<name> afinal vai a <class><when>." (PT coach) with `msg_metadata` `comeBack` true and the
  `lessonInstanceId`, one `message_created` is published and one push is sent to the coach; the repeat sends
  no message and no push; no `reminder_confirmed` reaches the student
test: `backend/padel_app/tests/test_engine_afinal_vou_presence.py` › `test_every_return_tells_the_coach_once`

#### NOTIFICATIONS-ENGINE-STORE-37: A return that is not placed, or rolled back, tells the coach nothing (rule 16)
- **Given** a new-engine class whose returning student's side is full, and another whose return's unit is
  made to roll back after the `Placed` is applied
- **When** each student posts `yes`
- **Then** the first answer is `spot_filled`, and neither case creates a message to the coach or sends a push
test: `backend/padel_app/tests/test_engine_afinal_vou_presence.py` › `test_a_return_not_placed_tells_the_coach_nothing`

#### NOTIFICATIONS-ENGINE-STORE-38: A regular's No on a class with notifications off records the absence and invites nobody (rule 17)
Given a new-engine class with `notifications_enabled` off, its coach's `autoNotifyEnabled` on, and
students who could be invited, when its regular says No through the app's entry point, then the presence
is absent and the seat freed, and no invitation and no outbox row to anyone but the regular is written.
test: `backend/padel_app/tests/test_engine_notifications_off.py` › `test_a_no_on_a_class_with_notifications_off_invites_nobody`

#### NOTIFICATIONS-ENGINE-STORE-39: A private lesson that inherits its automatic invitations invites nobody on a No (rule 17)
Given a new-engine private lesson's occurrence with `auto_invites` NULL at both levels (off by its type),
when its regular says No, then the absence is recorded and no invitation is written.
test: `backend/padel_app/tests/test_engine_notifications_off.py` › `test_a_no_on_a_private_lesson_invites_nobody`

#### NOTIFICATIONS-ENGINE-STORE-40: A coach with automatic notifications off invites nobody on a No (rule 17)
Given a new-engine class whose coach has `autoNotifyEnabled` off, when its regular says No, then the
absence is recorded and no invitation is written.
test: `backend/padel_app/tests/test_engine_notifications_off.py` › `test_a_no_with_the_coachs_switch_off_invites_nobody`

#### NOTIFICATIONS-ENGINE-STORE-41: After the switch goes off, a No sends no next invitation and a Yes still takes the seat (rule 17)
Given a new-engine class whose invitations went out while its notifications were on, and students still
left to invite, when the class's `notifications_enabled` goes off and one invitee answers No, then no
new invitation is written; when another invitee answers Yes, they are placed in the class.
test: `backend/padel_app/tests/test_engine_notifications_off.py` › `test_after_the_switch_goes_off_a_no_invites_nobody_and_a_yes_takes_the_seat`

#### NOTIFICATIONS-ENGINE-STORE-42: With every switch on, a regular's No invites (rule 17)
Given a new-engine class with every switch on, when its regular says No, then invitations are written for
the freed seat.
test: `backend/padel_app/tests/test_engine_notifications_off.py` › `test_with_every_switch_on_a_no_invites`

#### NOTIFICATIONS-ENGINE-STORE-43: The coach's invitation by hand still goes with the class's notifications off (rule 17)
Given a new-engine class with `notifications_enabled` off and an open seat, when the coach invites one
student by hand, then that student's invitation is written and sent, and no other invitation is.
test: `backend/padel_app/tests/test_engine_notifications_off.py` › `test_the_coachs_invitation_by_hand_still_goes`

#### NOTIFICATIONS-ENGINE-STORE-44: A class edit's re-plan of a class with notifications off sends nothing (rule 17)
Given a new-engine class with an open seat and `notifications_enabled` off, when the app re-plans it (a
class edit, `replan`), then no invitation is written.
test: `backend/padel_app/tests/test_engine_notifications_off.py` › `test_a_replan_of_a_class_with_notifications_off_sends_nothing`

#### NOTIFICATIONS-ENGINE-STORE-45: The tick and the request paths read the same switches (rule 17)
Given new-engine classes covering every combination of the coach's `autoNotifyEnabled`, the class's
`notifications_enabled` and its effective `auto_invites`, and a coach with no stored row, when the store
lists sessions and is asked whether each plans, then a session plans exactly when it is listed.
test: `backend/padel_app/tests/test_engine_notifications_off.py` › `test_plans_and_the_listing_read_the_same_switches`

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
9. (engine reminder yes, 2026-11-26) STORE-25 to STORE-27 — `services/engine_store.py` (`Answered`,
   `repair_confirmed`), `services/engine_entry.py` (`answer_attendance_request`).
10. (engine "Afinal vou", 2026-11-26) STORE-28 to STORE-33 — `services/engine_store.py` (`Left`, `Placed`
   `regular_returns`, `Answered`, `repair_confirmed`), `services/engine_entry.py` (`answer_attendance_request`),
   `services/notification_service.py` (`_clear_decline_source`).
11. (engine notifications off, 2026-11-27) STORE-38 to STORE-45 — `services/engine_store.py` (`plans`, the
   predicate `sessions()` shares), `invitation_engine/store.py` (`plans` on the protocol and `MemoryStore`),
   `invitation_engine/engine.py` (`_plan`).
12. ("Afinal vou" while a place is free, 2026-11-26; after `notifications.engine-answers` ANSWERS-35, 36)
   STORE-31 (amended), STORE-34, STORE-35 — `services/engine_store.py` (`ENROLMENT_SOURCE["returns"] =
   "fill"`; `Placed` `returns` writes the presence as `regular_returns` does and skips
   `_spend_standing_credit`; `snapshot` carries the students who left by a cancellation),
   `services/engine_entry.py` (`answer_attendance_request`: `Returns` for a non-regular, `spot_filled`
   when not placed; a repeat answers `duplicate`).
13. ("Afinal vou" tells the coach, owner 2026-11-26) STORE-36, STORE-37 — `services/engine_store.py` (`Placed`
   `regular_returns`/`returns` queue the notice after commit, beside `presence_changed`),
   `services/notification_service.py` (`_notify_coach_of_return` reused, its push body by the coach's display
   name), outbox or after-commit hook so a retried apply sends once.

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
- "Afinal vou" from a student who is not a regular (rule 14, STORE-31; 26 Nov 2026) — **answered by the
  owner (26 Nov 2026, relayed by the orchestrator): "Let's fix it. We should only show afinal vou if
  there's still places left."** Such a student takes a free place on their side back through the engine's
  `Returns` (rule 15, `notifications.engine-answers` rule 16); the button shows only while that place is
  free (`attendance.confirm` rule 32); a place that went before the tap answers `spot_filled`. The
  interim decision (route answers `spot_filled` without asking the engine) is withdrawn.
- Retiring the open invitation for a returning student's place (rule 15) — answered by the owner (26 Nov
  2026): "it's not really withdrawing the invitation. It's a short cut … The others that were invited just
  weren't fast enough." D4 stands; see `notifications.engine-answers`' Open questions.
- The coach's "afinal vai" message and push on a new-engine return (rules 14, 15) — answered by the owner
  (26 Nov 2026, relayed by the orchestrator): "Yes let's send the notification letting the coach know the
  player will come after all." Rule 16: every return, regular or not, tells the coach as the old path did.
- The run's log line (rule 7, STORE-20; prod slowness, 25 Nov 2026) — decision (hotfix agent, owner's
  order, nobody reachable to review; the owner can reverse it): a log line only, not exposed on admin
  engine-health, because APScheduler logs no run lines and the log is the cheapest place to read it.
- The sessions' tick's cost (rule 7, STORE-21; prod 25 Nov 2026: about 110 statements and three snapshots
  per listed session, full reads of the coach's history per snapshot) — decision (hotfix agent, owner's
  order relayed by the coordinator to widen the fix, nobody reachable to review; the owner can reverse
  it): reuse the snapshot when a step applied nothing, and scope the history reads in SQL. This touches
  `Engine.tick` (`notifications.engine-planning`'s run) without changing what it decides.
- Automatic waiting-list offers and automatic entry on a class whose switches are off (rule 17; P0, 27 Nov
  2026) — decided by the orchestrator, 27 Nov 2026, under the owner's words of 26 Nov ("já desliguei as
  notificações automáticas... continua a mandar"); the owner can overrule it: on a switched-off class
  nothing automatic happens and the coach places by hand. None, on any switch. The waiting list's invitations are automatic invitations: on the old engine they go out in the
  same gated batch as the groups' (`notifications.waiting-list` rule 4, PAD-446), so the class's
  `notifications_enabled` and the coach's `autoNotifyEnabled` stop them (`trigger_invitations`), and
  `notifications.toggle-class` rule 6 (PAD-429) says they stop with `auto_invites` off too. What that rule
  keeps going with `auto_invites` off, the offer to join the list made to a student who asked, is on the
  new engine the "sorry" reply to the acting student (`notifications.engine-answers`), which rule 17 does
  not stop. Automatic entry from a waiting list (`notifications.engine-settings` rule 3) has no old-engine
  counterpart since PAD-446; it stops with the switches, as the tick already did for an unlisted session
  (`notifications.config` rule 19). Decided with the rest: it stops.
- Attendance requests (reminders) on a class where only automatic invitations are off (rule 17;
  `notifications.config` rule 19) — not changed by the P0 fix, open for the owner: the tick's listing
  drops the whole session, so the scheduled attendance requests stop too, whereas the old engine kept
  reminders on a class with only `auto_invites` off (it stopped them for `notifications_enabled` off). The
  coach's attendance request by hand still goes. Making the tick run the timeline for such a session is a
  change to the listing, not to rule 17.
- What rule 17 does not cover (P0, 27 Nov 2026), open: an invitation already in the outbox when the switch
  goes off (committed, not yet dispatched) is still sent, because `dispatch` reads no switch and skipping
  it would leave an open invitation no one was told about; invitations sent before the switch went off
  stay open (nothing withdraws them), and while the session is unlisted the tick runs no timeline for it
  (their counting-until, attendance requests and absences after the class wait until it is listed again);
  the coach's semi-automatic answer on such a class sends nothing.
- Found by the review of rule 17's fix (27 Nov 2026), open, not built: the run lists its sessions once and
  does not ask again before planning each one, so a class switched off between the listing and its own
  unit is still planned in that one run (a window of seconds); and while a class is off the plan's
  housekeeping stops with it (a pending approval request and a coach alert stay as they were until the
  switch is back on, when the next run plans the session again and refills a freed seat).
- How rule 16's notice is sent (27 Nov 2026, build agent; the owner can reverse it): a return's `Placed`
  row in `engine_effects` is an outbox row, sent by `dispatch` after the commit (once, claimed; a rollback
  drops it; a retried apply finds its key and writes nothing). The push names the student by the coach's
  display name on the new engine only; the old path's `_notify_coach_of_return` push keeps the real name.
- The class detail's invitee row (`calendar.event-detail` ND1) reads a `returns` placement as placed, so an
  invitee who cancelled and came back reads `accepted` again (CALENDAR-EVENT-DETAIL-33), not
  `not_counting`.
