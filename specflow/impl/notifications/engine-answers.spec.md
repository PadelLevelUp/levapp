---
id: notifications.engine-answers
status: draft
depends_on: [notifications.engine-planning, notifications.engine-spots]
serves: [P-NOTIFICATIONS-9]
governed_by: []
---

# notifications.engine-answers

### Intent
What happens when a student answers an invitation of the redesigned engine (PAD-899; plan §7, D4,
D6, D7, D20; ruling of 2026-11-11 closing Q6 and Q10; coordinator rulings (1) and (4) and (a) of
2026-11-11).

### Entities
Stated as observable records; storage is the engine package's (PAD-902).
- **READS:** the invitation and its offer, the session's counts at the moment of the answer.
- **WRITES:** `Answered` (yes or no); `Placed` within the offer.
- **CREATES:** `Message` effects of kind const:KIND_SORRY (with the waiting-list offer); `Refused` for
  an accept with no open invitation.

### Rules
1. **Yes, and there is room (§7, D20).** The Yes succeeds when `class_empty > 0` and a spot of a type
   the offer fits is open (`notifications.engine-planning` rule 4); the student is placed within
   the offer. **A named side binds:** a student told "right side" is placed on the right or not at all.
2. **Where an either-side offer places them (D7, D6).** On their own side if it is open, even from the
   waiting list, even when the other side is harder to fill. A {left, right} student goes on the side
   with the fewest candidates per open spot, candidates as `notifications.engine-planning` rule 5.1
   counts them, the answering student left out. They count under that side and may still be moved at
   `last_invite_at` (`notifications.engine-spots` rule 5).
3. **No other-side offer (the owner, 2026-11-12: Codex decision 1 and waiting-list answer 4).** A Yes
   that cannot place the student within the offer gets rule 4's sorry, even when a spot of another
   type they fit is open. The engine never offers them another side or type on that answer; the
   student is never placed on a side they were not told.
4. **No room for them (§7, D4; the owner's decision 1).** const:KIND_SORRY: "sorry", with the offer to
   join the session's waiting list. The Yes is recorded, the invitation **no longer counts** toward
   coverage or M and offers nothing more: the engine never asks that student again for the session
   because a spot reopens. **Only if they join the session's waiting list** does the same invitation
   (D1) reopen when the list's turn reaches them, as a waiting-list invitation
   (const:KIND_WAITING_LIST_INVITE, `notifications.engine-planning` rule 5.3), or are they placed by
   automatic entry (`notifications.engine-settings` rule 3). Rule 10 still closes it.
5. **No is final for this session (§7)**: a gate for automatic invitations from then on
   (`notifications.engine-tiers` rule 3). The engine runs again at once.
6. **Cancels after accepting (§7).** The same absence rules as a regular
   (`notifications.engine-timeline` rule 5).
7. **The last spot (§7).** Claimed in one database transaction: of two Yes at the same moment for the
   last spot, exactly one is placed and the other gets rule 4's sorry (rule 3: never another offer).
8. **An accept with no open invitation (ruling (4)).** Refused: nothing placed, nothing sent.
9. **Accepting fills a spot for that session only (§8).** It does not enrol the student in the class.
10. **Never two sessions at the same hour (Tomás's point 2: "nunca se quebra"; owner ruling 2026-11-11;
    D4's exception).** The same hour is `notifications.engine-tiers` rule 3's. Any placement — a Yes to
    an invitation, a direct join, automatic entry — closes the student's other open invitations for
    other sessions at the same hour: nothing is sent for them and they no longer count. **Every engine
    placement path refuses a second placement at the same hour:** an accept is refused with nothing
    placed and nothing sent (rule 8's form); a direct join is refused; automatic entry skips the
    student. The coach's add is the app's (`classes.instance-enrollment` rule 15 refuses one at a busy
    time); one that goes through reaches the engine as `CoachAdded(student, side, firm)` on the session
    added to, in that session's unit with the student named (`notifications.engine-store` rule 9 says
    which side the app passes, and whether the coach chose it). The app already wrote the enrolment, so
    the engine writes no second one; it **places a going student on a side**: a **firm** side, the one
    the coach chose, is taken as given, even outside the sides the student plays, and replaces any
    side they hold that is not that one held firmly; otherwise, and only while their placement has no
    side, the app's `side` when the student plays it, else the student's single side, else none (a
    flexible student stays unplaced until `last_invite_at`, `notifications.engine-timeline` rule 6). A
    student who is not going gets no side. The side is a `SideAssigned` that carries whether it is firm,
    with no message (a first side is not a move, and the coach's choice is not announced). A firm side is
    never moved at `last_invite_at` (`notifications.engine-timeline` rule 6). The coach's later choice of
    a going student's side for the session (`classes.instance-enrollment` rule 13, PAD-551) reaches the
    engine as `CoachSetsSide(student, side)`: a firm `SideAssigned` and a re-plan, with no message;
    clearing that choice changes nothing in the engine. A `CoachAdded` then closes
    the student's open invitations for every session at the same time (`InvitationClosed`, as any
    placement does), re-plans that session, and each session it touched re-plans in its own unit. **Two requests by one student never run at once:** the engine names the student in
    the unit of work and the store locks the student before the session (always students, then the
    session; no unit holds two sessions). A placement the planner makes (automatic entry), which names
    no student in advance, is checked when it is applied: if the student was placed in an overlapping
    session since the snapshot, the store refuses the unit (`UnitConflict`) and rolls it back, the engine
    drops that unit's effects and the next run re-plans on fresh state. The store checks every
    placement this way when it applies it, whatever path made it, under the student's lock: a clash
    is `SameHourConflict`, a `UnitConflict`, so the student is never written into two overlapping
    sessions. This is the safety rule; the run's efficiency rule, which does not invite a
    student holding a counting invitation that club day, is `notifications.engine-tiers` rule 10.
11. **The engine's message kinds never reuse a name today's app gives another message (swap decision 8;
    PAD-913).** The kinds are const:KIND_SORRY, const:KIND_ADDED,
    const:KIND_SIDE_MOVED, const:KIND_WAITING_LIST_INVITE and const:KIND_INVITE. A kind that shares a name
    with a key of today's `DEFAULT_MESSAGE_TEMPLATES` means the same message (const:KIND_WAITING_LIST_INVITE,
    the invitation sent from a waiting list; const:KIND_INVITE, the ordinary invitation, PAD-932). `waiting_list_offer` is not an engine kind: today it is
    "spot taken, join the list?", which the engine says as const:KIND_SORRY, rendered through that same
    `waiting_list_offer` template so a coach's own text carries over (`notifications.message-templates`,
    new-engine section).
12. **One waiting-list entry per student per session (coordinator ruling, PAD-916, 2026-11-11).** A
    student is on the coach's list or the students' list of a session, never both. Joining the list
    they are already on changes nothing and answers today's `already_on_list` (`notifications.waiting-list`
    rule 18); joining the other one, by the student or by the coach, is refused with the same
    `already_on_list` and changes nothing (the coach removes the entry first
    to move it). The store refuses a second entry as well (`StoreConflict`).
13. **An answer records who gave it.** An answer to an invitation carries `by`: `student` when the
    student answered, `coach` when the coach recorded it for them (`notifications.invitations` rule 9,
    the coach's route); the `Answered` effect keeps it, and the store writes it as the invitation's
    `answeredBy` (`notifications.invitations` NB1, `calendar.event-detail` ND1). An attendance answer
    (`ConfirmAttendance`) is the student's; the coach's own attendance mark is `attendance.confirm`'s.
    Who answered changes nothing else.
14. **A coach's removal of a regular from one session** (the coordinator's ruling, from R's staging
    rehearsal, 2026-11-12). The app deletes the presence and sends the engine `CoachExcludes(student)` for
    that session: the engine never invites them back to it (`notifications.engine-tiers` rule 3), and the
    coach can still add them by hand. The store keeps them as a regular removed from the session, so their
    seat counts as freed on their side (`notifications.engine-settings` rule 11, S's reading). Other
    sessions of the class are untouched.
15. **The coach invites a student by hand (the owner's decision 17, PAD-932, 2026-11-13;
    `notifications.manual` NM1).** The app sends `CoachInvites(students)` for one session, after the
    route's own refusals. A student named twice is handled once. For each student the engine, under the
    student's lock:
    - refuses with a reason, emitting nothing for them, the first that applies in this order: in the
      session, placed or a regular of it, absent regulars included (`already_in_class`); placed at the
      same hour (`same_hour`, rule 10); holding a counting invitation for it (`already_invited`); no open
      spot type their playable sides fit (`no_open_spot`);
    - else emits `Invited`, or `Reopened` with `manual` true for an existing row (D1: one per student): a row that
      stopped counting, was answered No or sorry, was withdrawn, or was closed `same_hour` or
      `class_removed` while the student is no longer busy. Either carries the coach's-list tier, `manual`
      true, the offer every open spot type their sides fit, and the counting-until instant
      `notifications.engine-timeline` rule 4 gives a hand invitation. When the coach's tiers have no
      coach's list, the tier is none and the invitation still goes out (shown `tierSource` null all the same). It skips the eligibility bar, the
      coach's gates, "said No for this session", the coach's own exclusions (rule 14's `CoachExcludes`
      and semi-automatic's removed set) and postponement (`notifications.engine-tiers` rules 4, 10): the
      coach chose the student by hand.
    It sends at once: quiet hours, the invitation window and the class's automatic toggle do not hold it,
    and neither M nor a budget caps it, though it counts toward M and fills a type
    (`notifications.engine-planning` rules 3, 4, 8). In semi-automatic mode it needs no approval and
    changes no group's approval (`notifications.engine-planning` rule 14). The store writes `manual` on
    the `invitations` row; on a manual `Reopened` it clears `answer`, `answered_at`, `answered_by`,
    `sorry_at`, `closed_at` and `closed_reason`, sets `reopened_at`, and the message is const:KIND_INVITE
    (the ordinary invitation, not the waiting-list one). A reader shows a `manual` row with `tierSource` null, whatever its tier
    (`calendar.event-detail` ND1). The invitation is then like any other: answered by
    rules 1–4 on the engine route, counted by the planner, one type's budget (`notifications.engine-planning`
    rule 4).

### Not this spec
- The answer endpoints, "the same answer twice" and "an answer after the class starts": kept as
  `notifications.invitations` rules 6, 9, 17 and 20.
- Moving invitations between spots: there are no spots to move between (D1).

### Today
- A Yes closes the vacancy and enrols under the vacancy-then-class lock: `respond_to_notification`
  (`backend/padel_app/services/notification_service.py:6374`), `_record_yes` (`:6321`), `_close_vacancy`
  (`:5856`); `notifications.invitations` rules 7, 10, 15. Pinned by `test_pad317_one_vacancy_close.py`,
  `test_pad499_accept_lock_ends_early.py`.
- Other live invitations are retired as "Vaga preenchida" and a late Yes reads `spot_filled` with the
  waiting-list button (rules 15, 15a; pinned by `test_pad609_fill_offers_the_waiting_list.py`,
  `test_waiting_list_offer_response.py`); a live invitation moves to a sibling spot (rule 18a).
- Not read beyond the function heads above. The new producer is `invitation_engine/answers.py`
  (`handle`), with its effects in `invitation_engine/effects.py`.

### Acceptance Criteria

#### NOTIFICATIONS-ENGINE-ANSWERS-1: The first Yes within the offer wins, whatever the tier (rule 1; S6)
Given 3 right-siders silent for T and 3 left-siders from group 2 invited to play right, when a left-sider
says Yes first, then the left-sider is placed on the right.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P06-lower-group-answers-first]`

#### NOTIFICATIONS-ENGINE-ANSWERS-2: A flexible Yes lands on the side with fewest candidates per spot (rule 2; S15)
Given a left spot with 3 counting candidates and a right spot with 1, when a {left, right} student with
an either-side offer says Yes, then they are placed on the right.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P15-flexible-placement-on-yes]`

#### NOTIFICATIONS-ENGINE-ANSWERS-3: A one-sided Yes lands on the student's own side when open (rule 2; S24)
Given a left and a right spot open, the left harder to fill, when a right-sider from the waiting list
says Yes to an either-side offer, then they are placed on the right.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P24-waiting-list-placement]`

#### NOTIFICATIONS-ENGINE-ANSWERS-4: A named side binds (rule 1; S20)
Given S20's run, when one of the 2 right-siders told "left" says Yes before the first 3 answer, then
they are placed left and the either spot stays with the first 3.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P20b-side-limit]`

#### NOTIFICATIONS-ENGINE-ANSWERS-5: A Yes whose offer filled gets sorry, even with another side open (rule 3)
Given scenario 1 at 19:08: a level-2 left-sider invited for the left, the left full, the right open and
an other-side group admitting them, when they say Yes, then they get const:KIND_SORRY with the
waiting-list offer and no offer to play right.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[01-exemplo-completo]`

#### NOTIFICATIONS-ENGINE-ANSWERS-6: A late Yes into a full session gets sorry and stops counting (rule 4; S29)
Given a right-sider holding a counting invitation and the session filled, when they say Yes, then they
get const:KIND_SORRY with the waiting-list offer, are not placed, and their invitation no longer counts.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P29-never-revoked]`

#### NOTIFICATIONS-ENGINE-ANSWERS-7: A student told sorry is asked again only from the waiting list (rule 4)
Given two right-siders told const:KIND_SORRY on a full session, one of whom joins the session's
waiting list, when a right regular says No after the reminder hour, then only the one on the list is
asked, their same invitation reopened as const:KIND_WAITING_LIST_INVITE, and the other is never asked
again.
test: `backend/padel_app/tests/test_invitation_engine_answers.py` › `test_sorry_is_asked_again_only_from_the_waiting_list`

#### NOTIFICATIONS-ENGINE-ANSWERS-8: Two Yes for the last spot place exactly one (rule 7; S32)
Given one spot left and two invitations offering it, when both say Yes at the same instant, then exactly
one student is placed and the other gets const:KIND_SORRY.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[78-dois-sim-ao-mesmo-tempo]`

#### NOTIFICATIONS-ENGINE-ANSWERS-9: An accept with no open invitation changes nothing (rule 8)
Given a student with no open invitation for a session, when an accept arrives for them, then it is
refused, no one is placed and no message is sent.
test: `backend/padel_app/tests/test_invitation_engine_answers.py` › `test_accept_without_invitation_is_refused`

#### NOTIFICATIONS-ENGINE-ANSWERS-10: The last spot is claimed in one transaction on Postgres (rule 7)
Given one spot left and two concurrent Yes on two connections, when both commit, then the session has
one more going student, not two.
test: `backend/padel_app/tests/test_invitation_engine_answers.py` › `test_last_spot_claimed_once_on_postgres`

#### NOTIFICATIONS-ENGINE-ANSWERS-11: A flexible Yes is placed where nobody else can go, and the other type tops up (rules 2, 5; S10)
Given S10's start (the flexible student counting for both types, 2 left-siders for the left), when the
flexible student says Yes, then they are placed on the right and the left type, holding 2 counting,
tops up to 3 on the next run.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P10a-one-flexible-candidate-two-types]`

#### NOTIFICATIONS-ENGINE-ANSWERS-12: After the either spot fills, a second Yes for it gets sorry (rule 3; S20)
Given S20's run and the either spot filled by one of the first 3 right-siders, the left spot open and a
tier admitting right-siders for it, when a second of the first 3 says Yes, then they get
const:KIND_SORRY, not a place and not an offer of the left.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P20a-side-limit]`

#### NOTIFICATIONS-ENGINE-ANSWERS-13: A Yes to one of two same-hour sessions closes the other invitation (rule 10; Tomás)
Given a student holding counting invitations to sessions A and B at the same hour, when they say Yes to
A, then they are placed in A and their invitation to B is closed: it no longer counts and B's next run
treats them as busy at that hour.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P34-same-hour-yes-closes-the-other]`

#### NOTIFICATIONS-ENGINE-ANSWERS-14: A second placement at the same hour is refused (rule 10)
Given a student going to session A, when an accept arrives for their open invitation to session B at the
same hour, then it is refused: nobody is placed and no message is sent.
test: `backend/padel_app/tests/test_invitation_engine_answers.py` › `test_second_same_hour_placement_is_refused`

#### NOTIFICATIONS-ENGINE-ANSWERS-15: Automatic entry closes the other same-hour invitations (rule 10)
Given `auto-entry` on, a waiting-list member of session A holding an open invitation to session B at the
same hour, when a spot they can take opens in A before `attendance_request_at`, then they are placed in
A and their invitation to B is closed.
test: `backend/padel_app/tests/test_invitation_engine_auto_entry.py` › `test_auto_entry_closes_the_same_hour_invitation`

#### NOTIFICATIONS-ENGINE-ANSWERS-16: A direct join at an hour the student already plays is refused (rule 10)
Given `direct-join` on and a student going to session A, when they try to join session B at the same
hour, which has a spot on their side, then the join is refused and nothing is placed.
test: `backend/padel_app/tests/test_invitation_engine_answers.py` › `test_direct_join_at_a_busy_hour_is_refused`

#### NOTIFICATIONS-ENGINE-ANSWERS-17: Automatic entry skips a student already placed at the same hour (rule 10)
Given `auto-entry` on and a waiting-list member of session B going to session A at the same hour, when a
spot they could take opens in B before `attendance_request_at`, then they are not placed in B.
test: `backend/padel_app/tests/test_invitation_engine_auto_entry.py` › `test_auto_entry_skips_a_student_busy_at_that_hour`

#### NOTIFICATIONS-ENGINE-ANSWERS-18: No engine kind reuses a name today's templates give another message (rule 11)
Given the engine's message kinds (`invitation_engine/effects.py` `MessageKind`) and the keys of today's
`DEFAULT_MESSAGE_TEMPLATES`, when they are compared, then every shared name renders the kind through the
template of that name (const:KIND_WAITING_LIST_INVITE and const:KIND_INVITE among them), `waiting_list_offer` is not a kind,
and const:KIND_SORRY renders through `waiting_list_offer`.
test: `backend/padel_app/tests/test_invitation_engine_messages.py` › `test_engine_kinds_do_not_reuse_todays_message_names`

#### NOTIFICATIONS-ENGINE-ANSWERS-19: Every engine write is one session's unit, and a student's answer locks the student (rule 10)
Given the engine handling answers and ticks, when it writes, then every write is inside one unit of
work for one session, units never nest, and a unit for a student's answer names and locks that student
before the session.
test: `backend/padel_app/tests/test_pad902_invitation_engine.py` › `test_every_engine_write_is_inside_one_session_unit_at_a_time`

#### NOTIFICATIONS-ENGINE-ANSWERS-20: A unit the store refuses is dropped and the rest runs (rule 10)
Given a tick in which one session's unit is refused (`UnitConflict`, a student placed in an overlapping session
since the snapshot), when the tick runs, then that unit's effects are dropped and rolled back, the
other sessions run, and the next run re-plans the refused session on fresh state.
test: `backend/padel_app/tests/test_pad902_invitation_engine.py` › `test_a_unit_the_store_refuses_is_dropped_and_the_rest_runs`

#### NOTIFICATIONS-ENGINE-ANSWERS-21: A student on one waiting list who joins the other is refused, already_on_list (rule 12)
Given a student on the coach's list of a session, when the student asks to join its students' list,
then the answer is a refusal with `already_on_list` and the session still has one entry for them, on the
coach's list with its side; when the coach adds them to the coach's list again, nothing changes; given
another student on the students' list, when the coach adds them to the coach's list, then that is
refused with `already_on_list`; and a second entry applied straight to the store raises
`StoreConflict`.
test: `backend/padel_app/tests/test_invitation_engine_answers.py` › `test_joining_the_other_list_is_refused_already_waiting`

#### NOTIFICATIONS-ENGINE-ANSWERS-22: A placement at an hour the student is already going elsewhere rolls its unit back (rule 10)
Given two overlapping sessions of one coach (19:00 for an hour, and 19:30) and a student placed in the
first, when the store applies an
automatic-entry placement of the same student in the second, then it raises `SameHourConflict` (a
`UnitConflict`), no presence is written in the second session, and the second session's snapshot lists
the student as busy at that time.
test: `backend/padel_app/tests/test_pad916_engine_store.py` › `test_a_placement_at_an_hour_the_student_is_going_elsewhere_rolls_back`

#### NOTIFICATIONS-ENGINE-ANSWERS-23: The engine refuses joins with a code (rule 12; classes.join-requests NJ1)
Given a session and students in each refusal case (already going, below the bar, no spot on their side,
busy at the same hour, already on a list, and a join after the class has started), when each asks to join
directly or join a list, then each refusal carries its code (`already_enrolled`, `ineligible`,
`side_full`, `busy_same_hour`, `already_on_list`, `class_closed`), never text.
test: `backend/padel_app/tests/test_invitation_engine_answers.py` › `test_joins_are_refused_with_a_code`

#### NOTIFICATIONS-ENGINE-ANSWERS-24: A Yes into a session overlapping one the student is going to is refused, and a touching one is not (rule 10)
Given a student going to the same coach's class from 18:00 to 19:30, when they say Yes to a 19:00
invitation, then nothing is placed and nothing sent; when another student going to a class that ends at
19:00 says Yes to it, then they are placed.
test: `backend/padel_app/tests/test_invitation_engine_answers.py` › `test_an_overlapping_yes_is_refused_and_a_touching_one_is_not`

#### NOTIFICATIONS-ENGINE-ANSWERS-25: A Yes whose offer filled gets sorry and never another side or type (rule 3)
Given a left-sider invited for the left, the left full and a right spot open that a tier admits them for,
when they say Yes, then they get const:KIND_SORRY and no other message, and their invitation's offer is
unchanged.
test: `backend/padel_app/tests/test_invitation_engine_answers.py` › `test_a_yes_whose_offer_filled_gets_sorry_never_another_side`

#### NOTIFICATIONS-ENGINE-ANSWERS-26: A Yes closes another coach's invitation only at the same start (rule 10; engine-tiers rule 3)
Given a student holding invitations to another coach's session at the same start and to another coach's
session at an overlapping but different start, when they say Yes here, then the first closes and the
second stays open.
test: `backend/padel_app/tests/test_invitation_engine_answers.py` › `test_a_yes_closes_another_coachs_invitation_only_at_the_same_start`

#### NOTIFICATIONS-ENGINE-ANSWERS-27: A coach's add closes the student's same-time invitations (rule 10)
Given a student holding counting invitations to two sessions at the same time as session A, when the coach
adds them to A (the app writes the presence) and A's unit applies `CoachAdded(student)`, then both
invitations close (nothing more is sent for them and they no longer count), no second presence is
written, and A and the two sessions each re-plan.
test: `backend/padel_app/tests/test_invitation_engine_answers.py` › `test_a_coachs_add_closes_the_students_same_time_invitations`

#### NOTIFICATIONS-ENGINE-ANSWERS-28: An answer records who gave it (rule 13)
Given two invitations, when the student answers yes to one and the coach records no for the other, then
the first `Answered` carries `by` `student` and the second `by` `coach`, and both are placed or declined
exactly as a student's answer would be.
test: `backend/padel_app/tests/test_invitation_engine_answers.py` › `test_an_answer_records_who_gave_it`

#### NOTIFICATIONS-ENGINE-ANSWERS-29: A regular the coach removed from a session is never invited back to it (rule 14)
Given a full class whose coach removes a right regular from one session, when the right spot is
uncovered and that regular passes an earlier tier than the other candidates, then they are not invited to
that session (`CoachExcludes`), the spot goes to the next candidate, and they stay a
candidate for the class's other sessions.
test: `backend/padel_app/tests/test_invitation_engine_answers.py` › `test_a_regular_the_coach_removed_is_never_invited_back`

#### NOTIFICATIONS-ENGINE-ANSWERS-30: A coach's invitation by hand is a counting coach's-list invitation, answered like any (rule 15)
Given a session with one open left spot, X = 3, M = 2 with 2 counting invitations already, in quiet hours,
and a {left, right} student below the bar, when the engine handles `CoachInvites([student])`, then one
`Invited` is emitted at once with the coach's-list tier, `manual`, offer {left}, the coach's-list tier's T,
and the session now has 3 counting (above M); the planner's next run counts it toward the left type's budget;
when the student says Yes, they are placed left by rule 1 and the bubble reads "confirmed".
test: `backend/padel_app/tests/test_invitation_engine_manual.py` › `test_a_coach_invitation_counts_and_is_answered_like_any`

#### NOTIFICATIONS-ENGINE-ANSWERS-31: A coach's invitation by hand refuses with a reason or reopens the student's row (rule 15)
Given a session with one open right spot and students: one left-only, one in the session, one placed at the
same hour, one holding a counting invitation, one whose invitation stopped counting and one who said No,
when the engine handles `CoachInvites` for all six, then the first four get `no_open_spot`,
`already_in_class`, `same_hour` and `already_invited` with no effect, and the last two get `Reopened`
with the coach's-list tier and `manual` true and a const:KIND_INVITE message, one row each; once the store applies it, each row has no answer,
no `sorry_at`, no `closed_at`, a `reopened_at`, counts again, and shows `tierSource` null and outcome `pending`.
test: `backend/padel_app/tests/test_invitation_engine_manual.py` › `test_a_coach_invitation_refuses_with_a_reason_or_reopens`

#### NOTIFICATIONS-ENGINE-ANSWERS-32: A coach's add places the student on a side, and a firm side holds (rule 10)
Given a session of 10 with 4 left and 4 right going, when the engine handles `CoachAdded` for a left-only
student with no side, then it emits `SideAssigned` left, not firm, and no message, and the next run's spot
types are one right `must` and nothing else; when it handles a firm right `CoachAdded` for a left-only
student, then the side is right, firm; a not-firm right for a left-only student gives left (their own); a
{left, right} student with no side gets no `SideAssigned` and stays unplaced; a student already placed on a
side keeps it for a `CoachAdded` with no firm side; a student who is not going gets nothing; and
`CoachSetsSide(student, "R")` on a going student placed left gives a firm right `SideAssigned` and no message.
test: `backend/padel_app/tests/test_invitation_engine_answers.py` › `test_a_coachs_add_places_the_student_on_a_side`

### Waves
Cross-spec order: `notifications/_overview.md`, "Engine waves".
1. (W3) ANSWERS-1, ANSWERS-2, ANSWERS-3, ANSWERS-9 — `invitation_engine/answers.py` (placement within
   the offer, refusals).
2. (W6) ANSWERS-4, ANSWERS-5, ANSWERS-6, ANSWERS-7, ANSWERS-8, ANSWERS-11, ANSWERS-12 — `invitation_engine/answers.py`
   (`sorry`, not counting after sorry), `invitation_engine/planner.py` (a sorry invitation reopened only
   from the waiting list), `adapters/new.py` (`sorry` logged as `aviso`).
   (Owner decisions, PAD-913) ANSWERS-5, ANSWERS-7, ANSWERS-12 again: the `reoffer` kind and the
   other-side offer go (`effects.py`, `answers.py`, `planner.py`, `adapters/new.py`).
3. (Swap) ANSWERS-10 — a table-backed `SessionStore`, out of scope for PAD-899 (`store.py`); at the
   engine swap.
4. (PAD-911) ANSWERS-13 to ANSWERS-17 — `invitation_engine/answers.py` (a placement closes the other
   same-hour invitations; a second same-hour placement refused), `invitation_engine/store.py`.
5. (Swap 3, PAD-915) ANSWERS-18 — `invitation_engine/effects.py` (`MessageKind`, the docstring),
   `invitation_engine/constants.py` (a `KIND_WAITING_LIST_INVITE`), `tests/invitation_scenarios/adapters/new.py`
   (its kind map). The scenario format's own `waiting_list_offer` (`scenario.schema.json`, `validate.py`,
   `adapters/today.py`) logs today's message and is not the engine's kind.
6. (Swap 3/4, PAD-915, PAD-916) ANSWERS-19, ANSWERS-20 — `invitation_engine/engine.py` (units naming
   students), the store's `unit()` (student locks, `UnitConflict`); the two-transaction proof is
   ANSWERS-10's Postgres test.
7. (PAD-916, PAD-915) ANSWERS-21 — `invitation_engine/answers.py` (`_join_waiting_list`), the store
   (one entry per student and session); ANSWERS-22 — the store's apply (`SameHourConflict`).
8. (Owner decisions, PAD-915) ANSWERS-5, ANSWERS-7, ANSWERS-12, ANSWERS-22 again, ANSWERS-24, ANSWERS-25 — `invitation_engine/answers.py` (no other-side offer, no re-offer, the overlap).
- (PAD-808) ANSWERS-32 — `invitation_engine/answers.py` (`coach_added_side`, `coach_sets_side`), `engine.py`,
  `requests.py` (`CoachAdded`'s side and firmness, `CoachSetsSide`), `effects.py` (`SideAssigned.firm`).

### Open questions
- The re-offer (Q6; the coordinator's ruling (1) of 2026-11-11) — **reversed by the owner**
  (2026-11-12): no re-offer after sorry ("we can't keep bothering people … that's exactly why we created
  the waiting list", Codex decision 1) and no other-side offer on a Yes ("sorry" with the waiting-list
  offer, waiting-list inspection answer 4). A sorry student is asked again only through the waiting
  list they joined (rule 4); that reading of decision 1 together with answer 1 is S's (PAD-913).
- A coach's add to a session at an hour where the student is already placed (rule 10) — not an
  engine path; covered at the engine swap (refused with the reason, Tomás's "nunca se quebra"; the
  owner may want a coach override, review pack).
- The name of the engine's waiting-list invitation kind (swap decision 8) — options: keep
  `waiting_list_offer`; a new name; today's `waiting_list_invite`. Decision (coordinator, owner away,
  PAD-912, 2026-11-11; the owner can reverse it): rename before any client renders it, to `waiting_list_invite`,
  because today's `waiting_list_offer` is the engine's sorry, and today's `waiting_list_invite`
  template already says exactly this message, in both locales.
- The coach's add at the same hour, an override or not — Decision (coordinator, owner away, PAD-912, 2026-11-11; the owner can reverse it): no override; the coach removes the
  student from the other session first, because Tomás's safety rule "nunca se quebra" and a refusal
  that names the other session tells the coach what to do (swap plan §3.1).
- A student on both waiting lists of one session (found by H building the table store, PAD-916) —
  decision (coordinator, owner away, 2026-11-11; the owner can reverse it): one entry per student per
  session; joining the other list is refused "already waiting" (rule 12). The refusal's wording on web
  and iOS is not yet specified; it goes with `notifications.waiting-list`'s swap step.
