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
    an invitation, a direct join, automatic entry, a coach's add — closes the student's other open
    invitations for other sessions at the same hour: nothing is sent for them and they no longer
    count. **Every placement path refuses a second placement at the same hour**, the coach's add
    included: an accept is refused with nothing placed and nothing sent (rule 8's form); automatic
    entry skips the student; a direct join is refused; a coach's add is refused with the reason shown
    to the coach. This is the safety rule; the run's efficiency rule, which does not invite a student
    holding a counting invitation that club day, is `notifications.engine-tiers` rule 10.

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

### Waves
Cross-spec order: `notifications/_overview.md`, "Engine waves".
1. (W3) ANSWERS-1, ANSWERS-2, ANSWERS-3, ANSWERS-9 — `invitation_engine/answers.py` (placement within
   the offer, refusals).
2. (W6) ANSWERS-4, ANSWERS-5, ANSWERS-6, ANSWERS-7, ANSWERS-8, ANSWERS-11, ANSWERS-12 — `invitation_engine/answers.py`
   (`reoffer`, `sorry`, not counting after sorry), `invitation_engine/planner.py` (re-offer on a
   reopened spot), `adapters/new.py` (`sorry` logged as `aviso`).
3. (Swap) ANSWERS-10 — a table-backed `SessionStore`, out of scope for PAD-899 (`store.py`); at the
   engine swap.
4. (PAD-911) ANSWERS-13, ANSWERS-14, ANSWERS-15 — `invitation_engine/answers.py` (a placement closes the other
   same-hour invitations; a second same-hour placement refused), `invitation_engine/store.py`.

### Open questions
- A re-offer when several other spot types fit: which one? — decision (owner away): the hardest by rule
  2's measure, because it is D6's rule for an either-side Yes.
- A coach's add to a session at an hour where the student is already placed (rule 10) — decision
  (owner away, PAD-911): refused with the reason, because Tomás's safety rule "nunca se quebra"; the
  owner may want a coach override (review pack).
