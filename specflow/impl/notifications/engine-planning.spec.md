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
  student per session (D1). `CoachAlert` effects (rule 11). `ApprovalRequest` effects in
  semi-automatic mode (rule 14).

### Rules
1. **When a run happens (§6).** For one session at a time: after every answer, cancellation, roster
   change or settings change, when the coach recomputes the class's suggestions
   (`notifications.semi-auto-approval` rule 12; `Engine.plan(session, now)`), and every
   const:ENGINE_RUN_EVERY in the background. It plans no
   invitation during quiet hours (D14), before `first_invite_at` or after `last_invite_at`
   (`notifications.engine-timeline` rules 1, 3, 6).
2. **An invitation is for a student and a session (D1).** Never for a spot. One per student per
   session; reopening a sorry invitation from the waiting list (`notifications.engine-answers` rule 4)
   changes its offer, never adds a second.
3. **Counting invitations (§2, D16).** An invitation counts while it is open, not answered "sorry"
   (`notifications.engine-answers` rule 4), and before its counting-until instant. Only counting
   invitations hold spots. An open invitation that stops counting stays open (rule 10).
4. **Offers (D20; Q10 closed; the owner's decision 16, 2026-11-13, PAD-931).** An offer is a set of sides
   at the class's level. It fits a current spot type when it contains a side the type needs (`must(v)`: v;
   `either`: any v with `open(v) > 0`). **A counting invitation fills one type's budget only** (decision
   16, reversing D20's "counts for both"): the type it covers in the cover phase, else the type this run
   sent it for, else the first type in the run's order (rule 5) whose budget it fits and still has room;
   holders whose offer fits one type only are assigned before flexible ones, so a flexible holder goes
   where no single-side holder can. Below, an invitation **fits** a type when its offer contains a side
   the type needs (candidacy, coverage, a Yes, postponing), and **fills** a type when it uses that
   type's budget (every budget comparison).
   So a {left, right} student sent for either side fills one side's budget, and 3 open spots at X = 3
   take 9 counting invitations, not 6. A right-sider sent to play left fits the left type only. Because
   types are recomputed every run (D8), an offer is matched against the types of each run, never stored
   as a type.
5. **The run (§6 step 2, D5, D9; coordinator ruling D-E21): cover first, then top up.** Each run has
   two phases, and an uncovered spot always beats a further invitation for a covered one (D9).
   - **Cover.** First, a spot held by a counting invitation of any tier is covered: each holder
     covers one type only, hardest type first. The spots left are then covered with new invitees: the
     run walks the **tiers in order** and, within a tier, serves the uncovered types **hardest first**
     (fewest candidates per uncovered spot, a type's candidates counted at its ideal tier, rule 6; a tie
     goes to the type whose ideal tier comes earlier in the order, and with the same ideal tier,
     rule 13). It sends at least one distinct person per uncovered spot, and up to D17's budget for
     those spots (X per spot at the type's ideal tier, else const:LOWER_TIER_PER_SPOT), counting the
     invitations that already fill the type (rule 4).
   - **Top up.** Only then are the covered types topped up to their budgets (rule 6), tiers in order.
   In each phase, in each tier, for each type in that order:
   1. **Candidates.** Students who pass the gates and the tier's rules for the type and either hold a
      counting invitation whose offer fits it (rule 4), or are not yet invited (D8), or hold an
      invitation answered "sorry" (`notifications.engine-answers` rule 4), are on this session's
      waiting list and fit the type — a candidate of that list's tier only.
      Postponed students are not candidates (`notifications.engine-tiers` rule 10).
   2. **Cover.** The tier covers as many of the type's uncovered spots as it has **distinct**
      candidates (D5), a candidate already used on a harder type not counted twice.
   3. **Send.** The type's budget for that tier is X per covered spot if the tier is the type's ideal
      tier, else const:LOWER_TIER_PER_SPOT per covered spot (rule 6). Counting invitations from any
      tier that fill this type's budget (rule 4: one type each) fill it first; new invitees fill the rest, chosen by
      the tier's ordering, never beyond the candidates, never above M (rule 8), never a revocation. A
      chosen student who holds a "sorry" invitation (on the waiting list, step 1) has it **reopened**
      as a waiting-list invitation (const:KIND_WAITING_LIST_INVITE) instead of a second one: its offer
      becomes this type and its counting-until instant is fixed anew (`notifications.engine-timeline`
      rule 4).
      **A new invitee's offer is every uncovered type of this tier they fit**, so a flexible student is
      told no side; the invitation still fills only the budget of the type it was sent for (rule 4).
   4. **Pass down.** Spots the tier cannot cover pass to the next tier in the same run. An empty tier
      costs no time.
6. **D17 (§6.1; Q9 closed: per spot type).** A type's **ideal tier** is the first tier with at least
   one candidate for it, recomputed every run. It tops up to X per covered spot; any other tier to
   const:LOWER_TIER_PER_SPOT, at once, rising to X the moment it becomes the ideal tier (its better
   tier's invitations stopped counting or said No). Nothing sent is taken back.
7. **Better fits come first, within the budget and M (D10).** A better-tier candidate who becomes
   available is invited when the invitations filling the type (rule 4) are below its budget and the session
   below M, else as soon as there is room. Lower tiers' invitations stay open. This is also how a
   postponed student (`notifications.engine-tiers` rule 10) is invited once free.
8. **M caps the session (D16).** A new invitation goes out only while the session's counting
   invitations are below M **and** the invitations filling the type (rule 4) are below its budget (rule
   5.3). One exception: a coach's invitation by hand (`notifications.engine-answers` rule 15) is not
   capped by M or by a budget, though it counts toward M and fills a type like any other.
9. **The message names a side only when it is outside the student's subset (D11).** A {left, right}
   student is never told a side. Waiting-list invitations follow the same rule.
10. **Never revoked (D4).** An invitation stays open until the student answers or the class starts. No
    run, fill, roster change or settings change withdraws it or edits its message. **One exception
    (Tomás's point 2, owner ruling 2026-11-11):** when the student is placed in another session at the
    same hour (`notifications.engine-tiers` rule 3), their open invitations for other sessions at that
    hour close (`notifications.engine-answers` rule 10); a student cannot play two sessions at once.
11. **Nobody left (§6 step 4).** When a spot type has uncovered spots and **no candidate in any tier**
    (no counting invitation fits it and no uninvited student fits it), the run emits a
    const:COACH_ALERT for the session. The alert carries a reason code (const:ALERT_NO_CANDIDATE, the
    only one), the spot type (its side, none for an either spot, and its level) and how many spots of
    that type are uncovered; never text. The store keeps one alert per session and type until the
    type's count changes, and turns it into the coach's message or dashboard card, whose wording is
    the app's (swap plan §6.3 item 7). A run that finds an alerted type covered, gone, or with a
    candidate again emits `AlertCleared` (session, spot type), and the store drops that alert, so a
    reader of the store's alerts sees only live ones.
12. **Why this waits for the better tier (D9).** A spot is covered once one distinct candidate holds a
    counting invitation for it; the next tier gets it only when it is uncovered.
13. **Ties in "hardest first" when M binds (coordinator ruling 2026-11-11, U7).** When two side types
    tie on candidates per uncovered spot, have the same ideal tier, and M cannot give both their
    budgets: the side with more
    uncovered spots is served first until the sides' uncovered spots are equal; the rest of M is split
    in halves; an odd leftover goes to the side with fewer going students, then to the side with fewer
    candidates in the tier. Without a tie, rule 5's order stands.
14. **Semi-automatic mode asks the coach before each group (owner ruling D2, 2026-11-11; the owner's
    shape, 2026-11-12: Codex decisions 5 and 10).** With `invitation_mode` `semi_automatic`
    (`notifications.config` rule 19) the engine is the same and plans the same; only what it sends
    changes. A **group** is a tier (`notifications.engine-tiers` rule 5): the coach's list, the students'
    list, each of the coach's groups. The store keeps, per session, the **approved groups**, the
    **removed** students, the **dismissed** groups, and the pending requests.
    - **Before the first send from a group** that is not approved for the session, the first group
      included, the run does not send from it. It emits `ApprovalRequest(session, tier, queues)`, with an
      id: the tier, and its queue for each open spot type from the dry run
      (`notifications.engine-tiers` rule 12). A run that would start two unapproved groups at once (for
      two spot types) asks for each. A run whose request for a tier equals the pending one emits nothing;
      a changed one replaces it, and the replaced one goes stale (its message's buttons decide nothing).
    - **An approved group stays approved for that session**: its rounds run on their own, and students
      who become candidates in it later (a coach's late add, a newly eligible student) are invited
      without asking again (decision 10). Returning to an approved earlier group asks nothing
      (`notifications.engine-tiers` rule 9). Approval never carries to another session.
    - The coach answers `ApproveGroup(session, request, removed)`: the request's tier is approved, the
      removed students are added to the session's removed set, the request is gone, and the session is
      re-planned at once and sends. An answer naming a request that is no longer pending decides
      nothing. An invitation's counting-until instant is fixed when it is really sent
      (`notifications.engine-timeline` rule 4).
    - A removed student is never invited automatically for that session, and the dry run gives them the
      stage `removed_by_coach`, so no later request lists them and automatic entry does not place them (the coach removed them by hand; it is not a No: the
      "said No" gate and direct join are unchanged).
    - The coach may answer `DismissGroup(session, request)` (today's "Ignorar"; the coordinator's
      dismissal reading, kept per group, reversible by the owner): that group is skipped for the session
      as if it had no candidates, so the next group is reached and asked for; it is asked for again only
      when the session's spot count changes or the coach reopens it from the class
      (`ReopenGroup(session, tier)`), the engine recording `GroupReopened` first. The spot count is the
      open spot types with their counts (`planner.spot_types`). Invitations already sent stay open
      (rule 10). A dismissal is about the group, not its students: a student of the dismissed group who
      also passes a later group is reached from that group and listed in its request; only the coach's
      removal keeps a student out.
    - A run with nothing left to send from a group it asked for (the session full, the types covered,
      the class started) withdraws that request, which goes stale. A run in quiet hours plans nothing
      (rule 1) and keeps the pending requests.
    - `ApproveGroup` or `DismissGroup` naming no pending request, and `ReopenGroup` on a group that is not
      dismissed, change nothing.
    - Only the planner's sends are held. Automatic entry from a waiting list is the coach's own setting
      and is not held; direct join is off in semi-automatic mode (`notifications.config` rule 19, the
      owner's Q3); waiting-list invitations, a reopened sorry invitation included, are invitations and
      are held like their group's.
    - Switching to `automatic` withdraws the pending requests and the next run sends as any automatic
      session, except from a dismissed group, which stays dismissed until the spot count changes or the
      coach reopens it (as today's rule 1a keeps a dismissed spot); the approved groups are emptied, so a
      later return to semi-automatic asks again for each group; switching to `semi_automatic` leaves open
      invitations as they are (rule 10).
    Nothing is planned before `first_invite_at` (rule 1), so no request is raised before the window.

### Not this spec
- Answers (`notifications.engine-answers`) and the session's clock (`notifications.engine-timeline`).
- The alert's channel and wording (open question).
- `maxTotal`, today's cap on invitations ever sent: dropped by the owner (Open questions).

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

#### NOTIFICATIONS-ENGINE-PLANNING-12: A flexible invitation is offered every type it fits but fills one type's budget (rules 4, 5; S10; decision 16)
Given capacity 8, must(L) 1 and must(R) 1, one {left, right} student and 5 left-siders, all group 1 for
the left type and only the flexible student for the right, X = 3, when the run plans, then the flexible
student is invited with offer {left, right} and no side named and fills the right type's budget, 3
left-siders are invited for the left type, 4 in all, and group 2 is not reached; when the flexible student
then says No, group 2 is the right type's ideal tier and the 2 uninvited left-siders are asked to play
right, the side named (cover), and the left type keeps its 3 counting.
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

#### NOTIFICATIONS-ENGINE-PLANNING-25: When the only candidate says No and no tier has another, the coach is alerted (rule 11; S11)
Given 3 left, 3 right and 1 {left, right} regular, 1 right-sider available and no left-sider, when the
right-sider says No, then no invitation goes out and a const:COACH_ALERT is raised.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P11b-both-regular-fills-other-side]`

#### NOTIFICATIONS-ENGINE-PLANNING-26: A "sorry" invitation is reopened only for a student on the waiting list (rules 5.1, 5.3)
Given two right-siders told sorry, one of whom joined the session's waiting list, when a right spot opens
after the reminder hour and the run tops up the right type, then the one on the list has the same
invitation reopened as const:KIND_WAITING_LIST_INVITE with a new counting-until instant, no second
invitation is created, and the other is not a candidate.
test: `backend/padel_app/tests/test_invitation_engine_planning.py` › `test_sorry_invitation_is_reopened_only_from_the_waiting_list`

#### NOTIFICATIONS-ENGINE-PLANNING-27: The coach alert carries a reason code, the spot type and its count, once per type until the count changes (rule 11)
Given a type with no candidate in any tier, when runs repeat with nothing changed and then the type's
uncovered count changes, then one alert is raised with const:ALERT_NO_CANDIDATE, the type's side and
level and its uncovered count, none on the repeats, and a new one at the change.
test: `backend/padel_app/tests/test_invitation_engine_planning.py` › `test_coach_alert_once_per_type_until_its_count_changes`

#### NOTIFICATIONS-ENGINE-PLANNING-28: A semi-automatic run asks before the first group, the first included (rule 14)
Given a semi-automatic coach and a session whose first group with candidates is the coach's list, when a
run plans inside the window, then no `Invited` effect is emitted and one `ApprovalRequest` is, for that
tier, carrying its queue per open type as `planner.evaluate` gives it; a second run with nothing changed
emits nothing.
test: `backend/padel_app/tests/test_invitation_engine_planning.py` › `test_semi_automatic_run_asks_before_the_first_group`

#### NOTIFICATIONS-ENGINE-PLANNING-29: Approving a group sends from it without the removed students, and T starts at the send (rule 14)
Given that pending request with A, B, C in the tier's queue, when the coach approves at 19:10 removing B,
then the run sends to A and C what an automatic run would, never to B, their invitations count from
19:10, and B is not in `said_no`.
test: `backend/padel_app/tests/test_invitation_engine_planning.py` › `test_approving_a_group_sends_from_it_without_the_removed`

#### NOTIFICATIONS-ENGINE-PLANNING-30: Rounds inside an approved group run alone; the next group asks again (rule 14)
Given group 1 approved and A, C invited from it, when A says No and the next run tops up from group 1,
then D (group 1) is invited with no request; when group 1 is spent and group 2's E would be invited, then
E is not invited and an `ApprovalRequest` for group 2 is emitted.
test: `backend/padel_app/tests/test_invitation_engine_planning.py` › `test_rounds_inside_an_approved_group_run_alone_and_the_next_group_asks`

#### NOTIFICATIONS-ENGINE-PLANNING-31: A pending request goes stale when nothing is left to send from its group, or when the coach turns automatic (rule 14)
Given a pending request for group 2, when the session fills, then the next run withdraws it; given
another pending request, when the coach switches to `automatic`, then it is withdrawn and the next run
sends.
test: `backend/padel_app/tests/test_invitation_engine_planning.py` › `test_a_pending_request_is_withdrawn_when_nothing_is_left_or_the_mode_turns_automatic`

#### NOTIFICATIONS-ENGINE-PLANNING-32: The store refuses a second invitation for one student and session (rule 2)
Given an invitation applied for a student in a session, when a second `Invited` for the same student
and session is applied, then the store raises `StoreConflict` and keeps the first.
test: `backend/padel_app/tests/test_pad916_engine_store.py` › `test_a_second_invitation_for_one_student_is_refused`

#### NOTIFICATIONS-ENGINE-PLANNING-33: A dismissed group is skipped, the next group is asked for, and the dismissed one returns only on a change or a reopen (rule 14)
Given a pending request for group 1, when the coach answers `DismissGroup`, then the next run asks for
group 2 and never sends from group 1; when a regular's No changes the spot count, or the coach reopens
group 1, then `GroupReopened` is recorded and the next run asks for group 1 again.
test: `backend/padel_app/tests/test_invitation_engine_planning.py` › `test_a_dismissed_group_is_skipped_until_a_change_or_a_reopen`

#### NOTIFICATIONS-ENGINE-PLANNING-34: An answer to a replaced request decides nothing, and a removed student is in no later request (rule 14)
Given a pending request R1 for group 1 listing A, B, C, when the coach approves R1 removing B and a later
run asks for group 2 with R2, then R2 does not list B; given R2 replaced by R3 before the coach answers,
when the coach approves R2, then nothing is approved, nothing is sent and R3 stays pending.
test: `backend/padel_app/tests/test_invitation_engine_planning.py` › `test_an_answer_to_a_replaced_request_decides_nothing_and_removed_students_stay_out`

#### NOTIFICATIONS-ENGINE-PLANNING-35: A dismissed group stays dismissed after a switch to automatic (rule 14)
Given group 1 dismissed in a semi-automatic session, when the coach switches to `automatic` and a run
happens with nothing changed, then group 1 sends nothing and the next group sends; when the spot count
changes, then group 1 sends again.
test: `backend/padel_app/tests/test_invitation_engine_planning.py` › `test_a_dismissed_group_survives_a_switch_to_automatic`

#### NOTIFICATIONS-ENGINE-PLANNING-36: Switching to automatic empties the approved groups (rule 14)
Given group 1 approved in a semi-automatic session, when the coach switches to `automatic` and back to
`semi_automatic`, then no group is approved and the next send from group 1 raises a request.
test: `backend/padel_app/tests/test_invitation_engine_planning.py` › `test_switching_to_automatic_empties_the_approved_groups`

#### NOTIFICATIONS-ENGINE-PLANNING-37: Quiet hours keep a pending request (rule 14)
Given a pending request, when runs happen during quiet hours, then the request stays pending and is
neither withdrawn nor replaced.
test: `backend/padel_app/tests/test_invitation_engine_planning.py` › `test_quiet_hours_keep_a_pending_request`

#### NOTIFICATIONS-ENGINE-PLANNING-38: A dismissal or reopening out of turn does nothing (rule 14)
Given a session with no pending request, when the coach answers `DismissGroup`, then nothing changes;
given a group that is not dismissed, when the coach answers `ReopenGroup`, then nothing changes and no
`GroupReopened` is recorded.
test: `backend/padel_app/tests/test_invitation_engine_planning.py` › `test_a_dismissal_or_reopening_out_of_turn_does_nothing`

#### NOTIFICATIONS-ENGINE-PLANNING-41: An approved group stays approved for the session, a late-added candidate included (rule 14; decision 10)
Given group 0 (the coach's list) approved, the engine past it and asking for group 2, when the coach adds a
student to the coach's list and a spot is uncovered, then the next run invites that student from group 0
with no new request for group 0; and the same group in another session is asked for afresh.
test: `backend/padel_app/tests/test_invitation_engine_planning.py` › `test_an_approved_group_stays_approved_for_the_session`

#### NOTIFICATIONS-ENGINE-PLANNING-39: One session can be re-planned on demand (rule 1)
Given two sessions, when `Engine.plan(session, now)` is called for one, then only that session is
planned, as a background run would plan it, and the other is untouched.
test: `backend/padel_app/tests/test_invitation_engine_planning.py` › `test_engine_plan_runs_one_session`

#### NOTIFICATIONS-ENGINE-PLANNING-40: An alert is cleared once its type is covered or has a candidate (rule 11)
Given an alerted right type, when a right-sider becomes a candidate and the next run invites them, then
that run emits `AlertCleared` for the type and the store holds no alert for it.
test: `backend/padel_app/tests/test_invitation_engine_planning.py` › `test_an_alert_is_cleared_once_its_type_has_a_candidate`

#### NOTIFICATIONS-ENGINE-PLANNING-42: Two groups about to start for two types each get their request (rule 14)
Given a semi-automatic session whose left type's ideal tier is group 1 and whose right type has nobody
before group 3, neither approved, when a run plans, then two `ApprovalRequest`s are emitted, one for group
1 and one for group 3, and approving group 3 sends its one per spot without waiting for group 1.
test: `backend/padel_app/tests/test_invitation_engine_planning.py` › `test_two_groups_about_to_start_each_get_their_request`

#### NOTIFICATIONS-ENGINE-PLANNING-43: A dismissed group's student is still reached from a later group (rule 14)
Given a student in group 1 and in the "everyone" group 3, group 1 dismissed and group 2 empty, when the run
reaches group 3, then that group's request lists the student.
test: `backend/padel_app/tests/test_invitation_engine_planning.py` › `test_a_dismissed_groups_student_is_reached_from_a_later_group`

#### NOTIFICATIONS-ENGINE-PLANNING-44: A sorry student on the waiting list is a candidate of that list's tier only (rule 5.1)
Given a student told sorry who joined the students' list and who also passes a later pool group, when a
spot of their type opens after the reminder hour, then they are a candidate of the students' list's tier
and of no later tier.
test: `backend/padel_app/tests/test_invitation_engine_planning.py` › `test_a_sorry_student_on_the_list_is_a_candidate_of_that_lists_tier_only`

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
5. (Swap 3, PAD-915) PLANNING-27 — `invitation_engine/effects.py` (`CoachAlert` fields),
   `invitation_engine/constants.py` (`ALERT_NO_CANDIDATE`), `invitation_engine/planner.py`.
6. (Swap, PAD-915) PLANNING-28 to PLANNING-31, PLANNING-33 to PLANNING-41 — `invitation_engine/effects.py` (`ApprovalRequest`),
   `invitation_engine/requests.py` (`ApproveGroup`, `DismissGroup`, `ReopenGroup`), `invitation_engine/planner.py` (the hold, from
   `evaluate`), `invitation_engine/settings.py` (`invitation_mode`); then (PAD-916) the store keeps the
   approved groups, removed students, dismissed groups and pending requests and sends each request through
   the outbox, and
   (`notifications.semi-auto-approval`, new-engine section) the coach's message and card.
7. (PAD-916) PLANNING-32 — the store (one invitation per student and session, `StoreConflict`).
8. (Owner decisions, PAD-915) PLANNING-26, PLANNING-28 to PLANNING-31, PLANNING-33 to PLANNING-38 again, PLANNING-41 to PLANNING-43 — `invitation_engine/planner.py`, `requests.py`, `effects.py` (per-group approval, reopening from the waiting list).

#### NOTIFICATIONS-ENGINE-PLANNING-47: Single-side holders fill budgets before a flexible one (rule 4)
Given must(L) 1 and must(R) 1 at X = 3, the left type the hardest, and counting holders: one {left, right},
three left-siders and two right-siders, when the run plans, then the flexible holder fills the right
type's budget (the left already has 3 single-side holders), both budgets are full and no invitation is sent.
test: `backend/padel_app/tests/test_invitation_engine_planning.py` › `test_single_side_holders_fill_budgets_before_flexible_ones`

#### NOTIFICATIONS-ENGINE-PLANNING-45: A flexible invitation fills one type's budget, so three spots take nine (rule 4, 5.3; decision 16)
Given capacity 4, one tier, X = 3, an unplaced {left, right} regular and a right regular (so 2 open
spots, the regulars' sides unset), and nine {left, right} students, when the run plans, then 6 are
invited for the two open spots, each offered
{left, right}; when the right regular leaves and a third spot opens, the next run invites 3 more, 9
counting for 3 spots (under D20 the 6 already sent covered all three).
test: `backend/padel_app/tests/test_invitation_engine_planning.py` › `test_a_flexible_invitation_fills_one_types_budget`

#### NOTIFICATIONS-ENGINE-PLANNING-46: Three open spots with flexible candidates take X each (rule 4; decision 16)
Given 2 left and 1 right spots open at X = 3 and 12 {left, right} candidates in one group, when the run
plans, then 9 are invited, no side named.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P40-flexible-candidates-three-spots]`

### Open questions
- Top-up order: tier by tier over all types, or type by type over the tiers? — decided (coordinator
  ruling D-E21, 2026-11-11, reversing this spec's first reading): neither alone. Each run covers every
  uncovered type first (tiers in order, hardest type first within a tier), then tops up the covered
  ones (rule 5). The type-by-type reading failed the plan's P10a, P10b and scenario 01; the plain tier
  order failed P10b's No branch (group 1 topped the left up before group 2 covered the right).
- The coach alert's channel (push, dashboard, both) is not in the plan — decision (owner away): the
  engine emits the effect; channel and wording go to the owner at review, because the scenarios assert
  only that an alert exists.
  **The owner's answer (Codex decision 14, 2026-11-12):** both, a push and a dashboard card
  (`dashboard.blocks` NA1–NA3); the trigger stays rule 11's.
- `maxTotal` (today's cap on invitations ever sent per session) has no place in the plan (U4) —
  decision (owner, 2026-11-11, swap decision 3): dropped. The new engine does not read it; M is the
  only cap, as D16 defines it.
- Semi-automatic mode (swap decision 2) — decision (owner, 2026-11-11): kept. "Semi automatic mode
  should have exactly the same engine, but instead of sending directly the message it should ask the
  coach permission." Rule 14's first shape (one request per session) was the coordinator's; the
  owner replaced it on 2026-11-12 (below). S's readings inside it (PAD-913): a removed student is
  excluded from that session's automatic invitations, not a No; automatic entry and direct join are not
  held, because they are the coach's own settings; no request before `first_invite_at`, so today's
  "Yes, at the window" button has nothing to schedule.
- What the coach's "Ignorar" (today's dismiss, `notifications.semi-auto-approval` rule 8) becomes —
  decision (coordinator, owner away, 2026-11-12; the owner can reverse it): a dismissal; first per
  session, now per group (`DismissGroup`, below); a dismissed group sends nothing and asks again only when its spot count changes or the coach
  reopens it from the class (rule 14), so a dismissal is never permanent while the class still changes.
- Semi-automatic approval's shape — **the owner's (2026-11-12, Codex decisions 5 and 10)**, replacing the
  coordinator's whole-session approved queue: ask before each group, the first included; an approved
  group stays approved for that session, later candidates included; ask again only before the next
  group. "Ignorar" stays the coordinator's dismissal (asked again on a spot-count change or a reopen),
  now per group: S's reading (PAD-913) is that a dismissed group is skipped like an empty one, so the
  next group is asked for, because a per-group "no" should not freeze the whole session.
- Two groups asked for at once (rule 14) — S's reading (PAD-913, 2026-11-12; the owner can reverse it):
  a run that would start sending from two unapproved groups for different spot types (the ideal tier for
  one type, a lower tier's one per spot for another, rule 6) asks for each, one request per group, so
  neither type waits on the other's approval. Decision 5 asks before each group; it did not say one at
  a time.
- A dismissed group's students (rule 14) — S's reading of N's question (PAD-913, 2026-11-12): still
  reachable from a later group they pass, because the dismissal is about the group; only a removal keeps
  a student out.
- Resetting the approved groups on a switch to automatic (rule 14, PLANNING-36) — S's reading (PAD-913;
  the owner can reverse it): decision 10 keeps a group approved for the session but did not decide
  resets; a coach who leaves semi-automatic and comes back is asked again.
- **Does one flexible (either-side) counting invitation fill one spot type's budget only, or every type it
  fits?** (rules 4 and 5.3, D5, D20; found on staging instance 783, PAD-913, 2026-11-12.) **Closed by the
  owner, 2026-11-13 (decision 16, PAD-931): one type only**, reversing D20's "counts for both": 9
  invitations for 3 spots, not 6. The owner pointed at scenario 52; it has one spot per side and passes
  under both readings, so P40 (a 783-like setup) pins the rule (PLANNING-46). PLANNING-12, P10a and P10b
  were re-derived; PLANNING-45 is N's unit test.
- **Is a cap on the total invitations sent per class wanted?** (Staging instance 783 went from 11 to 51
  overnight with nobody answering: rules 4, 5 working, rounds of fresh students once the last stopped
  counting; M caps only counting invitations.) The owner, 2026-11-13 (decision 19): decide after the
  staging test; the rules stay as written.
