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
- **WRITES:** `Answered` (yes or no); `Placed` within the offer; on a re-offer, the invitation's new
  offer and counting-until instant.
- **CREATES:** `Message` effects of kind const:KIND_SORRY (with the waiting-list offer) or
  const:KIND_REOFFER; `Refused` for an accept with no open invitation.

### Rules
1. **Yes, and there is room (§7, D20).** The Yes succeeds when `class_empty > 0` and a spot of a type
   the offer counts for is open (`notifications.engine-planning` rule 4); the student is placed within
   the offer. **A named side binds:** a student told "right side" is placed on the right or not at all.
2. **Where an either-side offer places them (D7, D6).** On their own side if it is open, even from the
   waiting list, even when the other side is harder to fill. A {left, right} student goes on the side
   with the fewest candidates per open spot, candidates as `notifications.engine-planning` rule 5.1
   counts them, the answering student left out. They count under that side and may still be moved at
   `last_invite_at` (`notifications.engine-spots` rule 5).
3. **The re-offer (§7; Q6 closed; rulings (1), (a)).** When a Yes cannot place the student within the
   offer but an open spot they fit remains, and some tier admits them for its type
   (`notifications.engine-tiers` rules 6, 7), the same invitation is re-offered for it:
   const:KIND_REOFFER ("the right side filled; can you play left?"). The Yes is not recorded as a final
   answer; the invitation stays open with that type as its offer and a new counting-until instant fixed
   at the re-offer (`notifications.engine-timeline` rule 4). With several such types, the hardest by
   rule 2's measure. Still one invitation (D1); the student is never placed on a side they were not told.
4. **No room for them (§7, D4; ruling (a)).** const:KIND_SORRY: "sorry", with the offer to join the
   session's waiting list. The invitation stays open but **does not count** toward coverage or M, and
   the student cannot take a spot with it until a re-offer. **When a spot they fit reopens, the engine
   re-offers it** (rule 3; ruling (1)), and from then it counts again. It stays open (D4) except as
   rule 10 closes it.
5. **No is final for this session (§7)**: a gate for automatic invitations from then on
   (`notifications.engine-tiers` rule 3). The engine runs again at once.
6. **Cancels after accepting (§7).** The same absence rules as a regular
   (`notifications.engine-timeline` rule 5).
7. **The last spot (§7).** Claimed in one database transaction: of two Yes at the same moment for the
   last spot, exactly one is placed and the other gets rule 4 (or rule 3 when another spot fits).
8. **An accept with no open invitation (ruling (4)).** Refused: nothing placed, nothing sent.
9. **Accepting fills a spot for that session only (§8).** It does not enrol the student in the class.
10. **Never two sessions at the same hour (Tomás's point 2: "nunca se quebra"; owner ruling 2026-11-11;
    D4's exception).** The same hour is `notifications.engine-tiers` rule 3's. Any placement — a Yes to
    an invitation, a direct join, automatic entry — closes the student's other open invitations for
    other sessions at the same hour: nothing is sent for them and they no longer count. **Every engine
    placement path refuses a second placement at the same hour:** an accept is refused with nothing
    placed and nothing sent (rule 8's form); a direct join is refused; automatic entry skips the
    student. The rule binds the engine's paths; the coach's add is not one of them and is covered at
    the engine swap. **Two requests by one student never run at once:** the engine names the student in
    the unit of work and the store locks the student before the session (always students, then the
    session; no unit holds two sessions). A placement the planner makes (automatic entry), which names
    no student in advance, is checked when it is applied: if the student was placed at the same start
    since the snapshot, the store refuses the unit (`UnitConflict`) and rolls it back, the engine
    drops that unit's effects and the next run re-plans on fresh state. The store checks every
    placement this way when it applies it, whatever path made it, under the student's lock: a clash
    is `SameHourConflict`, a `UnitConflict`, so the student is never written into two sessions with
    the same start. This is the safety rule; the run's efficiency rule, which does not invite a
    student holding a counting invitation that club day, is `notifications.engine-tiers` rule 10.
11. **The engine's message kinds never reuse a name today's app gives another message (swap decision 8;
    PAD-913).** The kinds are const:KIND_SORRY, const:KIND_REOFFER, const:KIND_ADDED,
    const:KIND_SIDE_MOVED and const:KIND_WAITING_LIST_INVITE. A kind that shares a name with a key of
    today's `DEFAULT_MESSAGE_TEMPLATES` means the same message (today const:KIND_WAITING_LIST_INVITE,
    the invitation sent from a waiting list). `waiting_list_offer` is not an engine kind: today it is
    "spot taken, join the list?", which the engine says as const:KIND_SORRY, rendered through that same
    `waiting_list_offer` template so a coach's own text carries over (`notifications.message-templates`,
    new-engine section).
12. **One waiting-list entry per student per session (coordinator ruling, PAD-916, 2026-11-11).** A
    student is on the coach's list or the students' list of a session, never both. Joining the list
    they are already on changes nothing and answers today's `already_on_list` (`notifications.waiting-list`
    rule 18); joining the other one, by the student or by the coach, is refused with the same
    `already_on_list` and changes nothing (the coach removes the entry first
    to move it). The store refuses a second entry as well (`StoreConflict`).

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

#### NOTIFICATIONS-ENGINE-ANSWERS-5: A Yes whose offer filled gets a re-offer for the open spot it fits (rule 3)
Given scenario 1 at 19:08 as re-derived on PAD-900: a level-2 left-sider invited for the left, the left
full, the right open and an other-side group admitting them, when they say Yes, then they get
const:KIND_REOFFER to play right, not const:KIND_SORRY.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[01-exemplo-completo]`

#### NOTIFICATIONS-ENGINE-ANSWERS-6: A late Yes into a full session gets sorry and stops counting (rule 4; S29)
Given a right-sider holding a counting invitation and the session filled, when they say Yes, then they
get const:KIND_SORRY with the waiting-list offer, are not placed, and their invitation no longer counts.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P29-never-revoked]`

#### NOTIFICATIONS-ENGINE-ANSWERS-7: A spot that reopens is re-offered to a student told sorry (rules 3, 4; ruling (1))
Given a right-sider who got const:KIND_SORRY on a full session, when a right regular says No, then the
same invitation is re-offered to them (const:KIND_REOFFER), counts again from then, and their Yes
places them on the right.
test: `backend/padel_app/tests/test_invitation_engine_answers.py` › `test_sorry_then_reopened_spot_is_reoffered`

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

#### NOTIFICATIONS-ENGINE-ANSWERS-12: After the either spot fills, a second Yes for it is re-offered the left (rule 3; S20)
Given S20's run and the either spot filled by one of the first 3 right-siders, the left spot open and a
tier admitting right-siders for it, when a second of the first 3 says Yes, then they get
const:KIND_REOFFER for the left, not a place.
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
template of that name (const:KIND_WAITING_LIST_INVITE among them), `waiting_list_offer` is not a kind,
and const:KIND_SORRY renders through `waiting_list_offer`.
test: `backend/padel_app/tests/test_invitation_engine_messages.py` › `test_engine_kinds_do_not_reuse_todays_message_names`

#### NOTIFICATIONS-ENGINE-ANSWERS-19: Every engine write is one session's unit, and a student's answer locks the student (rule 10)
Given the engine handling answers and ticks, when it writes, then every write is inside one unit of
work for one session, units never nest, and a unit for a student's answer names and locks that student
before the session.
test: `backend/padel_app/tests/test_pad902_invitation_engine.py` › `test_every_engine_write_is_inside_one_session_unit_at_a_time`

#### NOTIFICATIONS-ENGINE-ANSWERS-20: A unit the store refuses is dropped and the rest runs (rule 10)
Given a tick in which one session's unit is refused (`UnitConflict`, a student placed at the same start
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
Given two sessions with the same start and a student placed in the first, when the store applies an
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

### Waves
Cross-spec order: `notifications/_overview.md`, "Engine waves".
1. (W3) ANSWERS-1, ANSWERS-2, ANSWERS-3, ANSWERS-9 — `invitation_engine/answers.py` (placement within
   the offer, refusals).
2. (W6) ANSWERS-4, ANSWERS-5, ANSWERS-6, ANSWERS-7, ANSWERS-8, ANSWERS-11, ANSWERS-12 — `invitation_engine/answers.py`
   (`reoffer`, `sorry`, not counting after sorry), `invitation_engine/planner.py` (re-offer on a
   reopened spot), `adapters/new.py` (`sorry` logged as `aviso`).
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

### Open questions
- A re-offer when several other spot types fit: which one? — decision (owner away): the hardest by rule
  2's measure, because it is D6's rule for an either-side Yes.
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
