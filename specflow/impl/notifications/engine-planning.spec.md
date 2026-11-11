---
id: notifications.engine-planning
status: draft
depends_on: [notifications.engine-spots, notifications.engine-tiers, notifications.engine-timeline]
serves: [P-NOTIFICATIONS-8]
governed_by: []
---

# notifications.engine-planning

### Intent
One planning run of the redesigned engine: which invitations go out for a session, and when
(PAD-899; plan §2, §6, §6.1, D1, D4, D5, D9, D10, D11, D16, D17, D20; ruling of 2026-11-11 closing
Q9 and Q10; coordinator's tie rule of 2026-11-11).

### Entities
Stated as observable records; storage is the engine package's (PAD-902).
- **READS:** the spot types (`notifications.engine-spots`), tiers and candidates
  (`notifications.engine-tiers`), the snapshot's `invitations` with their offers and counting-until
  instants, X and M (`EngineSettings.invites_per_spot`, `.max_at_a_time`), the clock
  (`notifications.engine-timeline`).
- **CREATES:** `Invited` effects (`invitation_engine/effects.py`): student, session, offer, the side
  named, tier, and the instant it stops counting (`notifications.engine-timeline` rule 4). One per
  student per session (D1). `CoachAlert` effects (rule 11).

### Rules
1. **When a run happens (§6).** For one session at a time: after every answer, cancellation, roster
   change or settings change, and every const:ENGINE_RUN_EVERY in the background. It plans no
   invitation during quiet hours (D14), before `first_invite_at` or after `last_invite_at`
   (`notifications.engine-timeline` rules 1, 3, 6).
2. **An invitation is for a student and a session (D1).** Never for a spot. One per student per
   session; a re-offer (`notifications.engine-answers` rule 3) changes its offer, never adds a second.
3. **Counting invitations (§2, D16).** An invitation counts while it is open, not answered "sorry"
   (`notifications.engine-answers` rule 4), and before its counting-until instant. Only counting
   invitations hold spots. An open invitation that stops counting stays open (rule 10).
4. **Offers (D20; Q10 closed).** An offer is a set of sides at the class's level. It counts toward a
   current spot type when it contains a side the type needs (`must(v)`: v; `either`: any v with
   `open(v) > 0`). A {left, right} student sent for either side counts for both; a right-sider sent to
   play left counts for the left type only. Because types are recomputed every run (D8), an offer is
   matched against the types of each run, never stored as a type.
5. **The run (§6 step 2, D5, D9).** Spot types are taken **hardest first**: fewest candidates per
   uncovered spot, ties by rule 13. For each type, the tiers are walked in order:
   1. **Candidates.** Students who pass the gates and the tier's rules for the type and either hold a
      counting invitation whose offer counts for it (rule 4), or are not yet invited (D8), or hold an
      open invitation answered "sorry" (`notifications.engine-answers` rule 4) and fit the type.
      Postponed students are not candidates (`notifications.engine-tiers` rule 10).
   2. **Cover.** The tier covers as many of the type's uncovered spots as it has **distinct**
      candidates (D5), a candidate already used on a harder type not counted twice.
   3. **Top up.** The type's budget for that tier is X per covered spot if the tier is the type's ideal
      tier, else const:LOWER_TIER_PER_SPOT per covered spot (rule 6). Counting invitations from any
      tier whose offer counts for the type fill the budget first; new invitees fill the rest, chosen by
      the tier's ordering, never beyond the candidates, never above M (rule 8), never a revocation. A
      chosen student who holds a "sorry" invitation is **re-offered** it (const:KIND_REOFFER) instead
      of a second invitation: its offer becomes this type and its counting-until instant is fixed anew
      (coordinator ruling (1); `notifications.engine-timeline` rule 4).
      **A new invitee's offer is every uncovered type of this tier they fit**, so a flexible invitation
      sent for the hard type counts for the easy one too.
   4. **Pass down.** Spots the tier cannot cover pass to the next tier in the same run. An empty tier
      costs no time.
6. **D17 (§6.1; Q9 closed: per spot type).** A type's **ideal tier** is the first tier with at least
   one candidate for it, recomputed every run. It tops up to X per covered spot; any other tier to
   const:LOWER_TIER_PER_SPOT, at once, rising to X the moment it becomes the ideal tier (its better
   tier's invitations stopped counting or said No). Nothing sent is taken back.
7. **Better fits come first, within the budget and M (D10).** A better-tier candidate who becomes
   available is invited when the type's counting invitations are below its budget and the session
   below M, else as soon as there is room. Lower tiers' invitations stay open.
8. **M caps the session (D16).** A new invitation goes out only while the session's counting
   invitations are below M **and** the type's counting invitations are below its budget (rule 5.3).
9. **The message names a side only when it is outside the student's subset (D11).** A {left, right}
   student is never told a side. Waiting-list invitations follow the same rule.
10. **Never revoked (D4).** An invitation stays open until the student answers or the class starts. No
    run, fill, roster change or settings change withdraws it or edits its message.
11. **Nobody left (§6 step 4).** When a spot type has uncovered spots and **no candidate in any tier**
    (no counting invitation counts for it and no uninvited student fits it), the run emits a
    const:COACH_ALERT for the session naming the type. The store keeps one alert per session and type
    until the type's count changes.
12. **Why this waits for the better tier (D9).** A spot is covered once one distinct candidate holds a
    counting invitation for it; the next tier gets it only when it is uncovered.
13. **Ties in "hardest first" when M binds (coordinator ruling 2026-11-11, U7).** When two side types
    tie on candidates per uncovered spot and M cannot give both their budgets: the side with more
    uncovered spots is served first until the sides' uncovered spots are equal; the rest of M is split
    in halves; an odd leftover goes to the side with fewer going students, then to the side with fewer
    candidates in the tier. Without a tie, rule 5's order stands.

### Not this spec
- Answers (`notifications.engine-answers`) and the session's clock (`notifications.engine-timeline`).
- The alert's channel and wording (open question).
- `maxTotal`, today's cap on invitations ever sent (open question).

### Today
- Matching is per vacancy, in rounds and batches: `trigger_invitations`
  (`backend/padel_app/services/notification_service.py:5635`), `_send_invitation_batch` (`:5094`),
  `_defer_next_round` (`:5349`), `_round_max_count` (`:5345`), `_send_next_on_decline` (`:5467`), the tick
  `process_invitation_batches` (`:6117`, every 2 minutes), restrictions and `maxTotal` in
  `_check_restrictions` (`:2134`, `:2167`); `notifications.invitations` rules 1, 1b, 3e, 5, 8.
- Invitations are retired at a fill (`_close_vacancy`, `:5856`, rule 15), withdrawn for balance
  (`_withdraw_for_balance`, `:3442`, rule 2d) and moved to sibling spots (rule 18a); a spot holds while
  one is live (rule 16).
- The side phrase: `_side_phrase` (`:2225`); a waiting-list invitation always names the spot's side
  (`notifications.waiting-list` rule 16). No coach alert exists when a class cannot fill.
- Pinned by `test_pad87_empty_rounds_per_tick.py` (rule 3c, reversed by PLANNING-11),
  `test_pad432_max_total_budget.py` and `test_pad801_one_verdict_per_run.py` (`maxTotal`),
  `test_pad679_*` (sibling moves), `test_pad581_*` (balance withdrawals), `test_pad609_*` (retire at
  fill). Not read beyond the function heads above.
- The new run lands in `invitation_engine/planner.py` (`plan(snapshot, settings, now) -> Plan`).

### Acceptance Criteria

#### NOTIFICATIONS-ENGINE-PLANNING-1: After Nos leave a spot uncovered while the ideal tier still counts, the next tier gets 1 per spot (rules 5, 6; S1)
Given 4 spots of one type, X = 2, all 8 of the ideal tier's candidates invited and a lower tier with
candidates (S1: 8 right-siders, 6 left-siders; scenario 06: 8 level-2, 5 level-3 right-siders), when 5
of the 8 say No, then the lower tier gets exactly const:LOWER_TIER_PER_SPOT invitation for the 1
uncovered spot.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[06-grupo-com-mais-alunos-com-recusas]`

#### NOTIFICATIONS-ENGINE-PLANNING-2: When the ideal tier stops counting, the next becomes ideal and gets X per spot (rule 6; S1)
Given PLANNING-1's start and nobody answering within T, when the run plans, then the lower tier gets X
per spot capped by its candidates (S1: 6 of 8; scenario 07: 5) and every invitation sent stays open.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[07-grupo-convidado-sem-responder]`

#### NOTIFICATIONS-ENGINE-PLANNING-3: The lower tier covers what the ideal tier cannot, 1 per spot (rule 6; S2)
Given capacity 8, 4 left regulars, 3 right-siders in group 1, 6 left-siders in group 2, X = 3, M = 12,
when the run plans, a right-sider says No, and then the other two right-siders stop counting, then 3
right-siders and 1 left-sider are invited; after the No 1 more left-sider; after the T, group 2 is ideal
and the left-siders reach 6 in all (12 wanted, capped by 6 candidates).
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P02-group-smaller-than-spots]`

#### NOTIFICATIONS-ENGINE-PLANNING-4: A tier that can cover every spot is waited for (rule 12; S3)
Given 4 left and 1 right regulars, exactly 3 right-siders in group 1 and 6 left-siders, when the run
plans and then one right-sider says No, then no left-sider is invited before the No, and 1 after it.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P03a-wait-for-group-1-no]`

#### NOTIFICATIONS-ENGINE-PLANNING-5: A silent ideal tier hands every spot down at X (rule 6; S3)
Given S3's start, when all three right-siders are silent for T, then group 2 gets X × 3 = 9 wanted,
capped by its 6 candidates.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P03b-wait-for-group-1-silent]`

#### NOTIFICATIONS-ENGINE-PLANNING-6: A type's budget is X per covered spot (rules 5.3, 8; S4)
Given 4 left and 1 right regulars (must(R) 3), 20 right-siders and X = 3, when the run plans, then 9
are invited.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P04-spots-on-one-side]`

#### NOTIFICATIONS-ENGINE-PLANNING-7: Each T that runs out frees X more, the old ones still open (rules 3, 8; S5)
Given 4 left and 3 right regulars, 100 right-siders and X = 2, when nobody answers for three periods T,
then 2 go out, then 2 more after each T, all still open.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P05a-nobody-answers]`

#### NOTIFICATIONS-ENGINE-PLANNING-8: Counting invitations never exceed M (rule 8; S5b)
Given 4 left and 1 right regulars, 20 right-siders, X = 3 and M = 5, when the run plans and one invitee
answers, then 5 go out, one more after the answer, and never more than 5 count at once.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P05b-m-caps-the-session]`

#### NOTIFICATIONS-ENGINE-PLANNING-9: A better candidate waits for budget room (rule 7; S7)
Given a must(R) type whose counting invitations equal its budget, when a right-sider of a better tier
becomes eligible, then they are invited only once one counting invitation answers or stops counting;
given the type below its budget and the session below M, they are invited on the next run; lower
tiers' invitations stay open either way.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P07-better-fit-appears]`

#### NOTIFICATIONS-ENGINE-PLANNING-10: A newly eligible student is invited on the next run when there is room (rule 5.1; S8)
Given group 1 had no right-sider when the right spot opened, so group 2 was invited with 1 invitation
counting and X = 3, when a right-sider becomes eligible, then the next run counts them in group 1 and
invites them.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P08-candidates-recomputed]`

#### NOTIFICATIONS-ENGINE-PLANNING-11: Empty tiers are passed in the same run (rule 5.4; S9)
Given groups 1 and 2 empty and group 3 with candidates, when the run plans, then group 3 is invited in
that run.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P09-empty-tier-costs-no-time]`

#### NOTIFICATIONS-ENGINE-PLANNING-12: A flexible invitation counts for every type it was offered (rules 4, 5; S10)
Given capacity 8, must(L) 1 and must(R) 1, one {left, right} student and 5 left-siders, all group 1 for
the left type and only the flexible student for the right, X = 3, when the run plans, then the right
type is served first, the flexible student is invited with offer {left, right} and no side named, 2
left-siders are invited for the left type, 3 in all, and group 2 is not reached; when the flexible
student then says No, the right type is served first again, group 2 is its ideal tier and the 3
uninvited left-siders are asked to play right, the side named, and the left type keeps 2 counting.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P10b-one-flexible-candidate-two-types]`

#### NOTIFICATIONS-ENGINE-PLANNING-13: An either spot is offered across both sides by ordering (rule 5; S12)
Given capacity 8, 2 left, 2 right and 3 unplaced {left, right} regulars, 10 of each side available and
X = 3, when the run plans, then the top 3 by ordering from both sides are invited.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P12-several-both-regulars]`

#### NOTIFICATIONS-ENGINE-PLANNING-14: The flexible student is asked before the other side (rule 9; S14)
Given 4 left and 3 right regulars, one {left, right} student and 6 left-siders, when the run plans and
the flexible student says No, then they were invited with no side named, and then 3 left-siders are
invited with the right side named.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P14-inviting-a-flexible-student]`

#### NOTIFICATIONS-ENGINE-PLANNING-15: D17's scope is the spot type (rule 6; S20)
Given 2 left, 3 right and 1 unplaced {left, right} regular, 5 right-siders and no left-sider, when the
run plans, then 3 right-siders are invited for the either spot (offer right) and the other 2 are asked
to play left, side named, offer left: full X capped by candidates, because group 1 has nobody for
`must(L)`.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P20b-side-limit]`

#### NOTIFICATIONS-ENGINE-PLANNING-16: A side is named exactly when it is outside the subset (rule 9; S28)
Given a right spot, when a left-sider, a right-sider and a {left, right} student are invited for it,
then only the left-sider's message names a side.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P28-side-named-only-when-opposite]`

#### NOTIFICATIONS-ENGINE-PLANNING-17: A fill changes no invitation (rule 10; S29)
Given a right-sider holds an open invitation, when the spot fills, then no invitation of the session
changes state and no message is edited.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P29-never-revoked]`

#### NOTIFICATIONS-ENGINE-PLANNING-18: A type with no candidate in any tier alerts the coach (rule 11; S33)
Given a spot type with uncovered spots, when its last counting invitation stops counting and no tier has
an uninvited student who fits it, then a const:COACH_ALERT is raised for the session, and not before.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[73-so-convida-quem-esta-num-grupo]`

#### NOTIFICATIONS-ENGINE-PLANNING-19: With M binding and the sides tied, M splits in halves (rule 13)
Given capacity 16, 4 left and 4 right regulars going, 20 of each side in group 1, X = 3 and M = 12, when
the run plans, then 6 left and 6 right are invited.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[16-dois-lados-mesmas-vagas]`

#### NOTIFICATIONS-ENGINE-PLANNING-20: Without a tie, M goes to the hardest type (rule 5)
Given capacity 16, 6 left and 2 right regulars going, 20 of each side in group 1, X = 3 and M = 12, when
the run plans, then 12 right and 0 left are invited.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[15-limite-prioriza-lado-com-mais-vagas]`

#### NOTIFICATIONS-ENGINE-PLANNING-21: With the sides tied, the more vacant side is served first until they are equal (rule 13)
Given capacity 16, 6 left and 2 right regulars going, 30 right-siders and 10 left-siders in group 1 (5
per uncovered spot each side), X = 3 and M = 12, when the run plans, then all 12 go to the right.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[91-6-a-esquerda-e-2-a-direita-todo-o-limite-vai-para-a-direita]`

#### NOTIFICATIONS-ENGINE-PLANNING-22: An odd leftover goes to fewer going, then to fewer candidates (rule 13)
Given two side types tied on candidates per uncovered spot, equal uncovered spots, M binding with an odd
number left, when the run plans with the sides' going students unequal, then the leftover goes to the
side with fewer going; with going equal too, to the side with fewer candidates in the tier.
test: `backend/padel_app/tests/test_invitation_engine_planning.py` › `test_tie_leftover_goes_to_fewer_going_then_fewer_candidates`

#### NOTIFICATIONS-ENGINE-PLANNING-23: One invitation per student per session (rule 2, D1)
Given a student who holds an invitation for a session and fits a second type that opens, when the run
plans, then no second invitation is created for them; their existing offer counts for the new type only
if it contains its side.
test: `backend/padel_app/tests/test_invitation_engine_planning.py` › `test_one_invitation_per_student_per_session`

#### NOTIFICATIONS-ENGINE-PLANNING-24: Nothing is planned outside the invitation window (rule 1)
Given a session with open spots and candidates, when the run happens before `first_invite_at` or after
`last_invite_at`, then it creates no `Invited` effect.
test: `backend/padel_app/tests/test_invitation_engine_planning.py` › `test_no_invitation_outside_the_window`

#### NOTIFICATIONS-ENGINE-PLANNING-26: A "sorry" invitation is re-offered when the planner chooses its student (rule 5.3; ruling (1))
Given a right-sider holding an open invitation answered "sorry" and a right spot that reopens, when the
run tops up the right type and chooses them, then their invitation is re-offered (const:KIND_REOFFER),
no second invitation is created, and it counts again until a new counting-until instant.
test: `backend/padel_app/tests/test_invitation_engine_planning.py` › `test_sorry_invitation_is_reoffered_not_duplicated`

#### NOTIFICATIONS-ENGINE-PLANNING-25: When the only candidate says No and no tier has another, the coach is alerted (rule 11; S11)
Given 3 left, 3 right and 1 {left, right} regular, 1 right-sider available and no left-sider, when the
right-sider says No, then no invitation goes out and a const:COACH_ALERT is raised.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P11b-both-regular-fills-other-side]`

### Waves
Cross-spec order: `notifications/_overview.md`, "Engine waves".
1. (W2) PLANNING-6, PLANNING-11, PLANNING-16, PLANNING-23, PLANNING-24 — `invitation_engine/planner.py`
   (cover, top up, naming, one invitation, window).
2. (W5) PLANNING-1, PLANNING-3, PLANNING-4, PLANNING-5, PLANNING-12, PLANNING-13, PLANNING-15 —
   `invitation_engine/planner.py` (hardest first, D17, ideal tier, offers).
3. (W5) PLANNING-2, PLANNING-7, PLANNING-8, PLANNING-9, PLANNING-10, PLANNING-19, PLANNING-20,
   PLANNING-21, PLANNING-22 — `invitation_engine/planner.py` with counting from
   `invitation_engine/timeline.py` (budget, M, D10, tie rule).
4. (W7) PLANNING-14, PLANNING-17, PLANNING-18, PLANNING-25, PLANNING-26 — `invitation_engine/planner.py` (D4, the alert),
   `invitation_engine/store.py` (one alert per session and type), `adapters/new.py` (the alert as
   `coach_alert`).

### Open questions
- Top-up order: tier by tier over all types, or type by type, hardest first, over the tiers? The plan's
  §6 step 2 reads both ways, and only the second reproduces S10 (3 invitations at the start; 3
  left-siders to play right after the flexible No) — decision (owner away): type by type (rule 5),
  because S10 is the plan's own worked example.
- The coach alert's channel (push, dashboard, both) is not in the plan — decision (owner away): the
  engine emits the effect; channel and wording go to the owner at review, because the scenarios assert
  only that an alert exists.
- `maxTotal` (today's cap on invitations ever sent per session) has no place in the plan (U4) —
  decision (owner away): not read by the new engine; M is the only cap, because D16 defines M as the
  cap and nothing in §1–§8 keeps a second one. The owner may restore it at review.
