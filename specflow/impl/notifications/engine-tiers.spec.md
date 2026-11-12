---
id: notifications.engine-tiers
status: draft
depends_on: [notifications.engine-spots, notifications.groups, eligibility.rules]
serves: [P-NOTIFICATIONS-8]
governed_by: []
---

# notifications.engine-tiers

### Intent
Who may be asked, and in what order, for each spot type of a session (PAD-899; plan §3, §5, §5.1,
D8, D12, D13, D15; ruling of 2026-11-11 closing Q2, Q4, Q7; coordinator ruling (3) of 2026-11-11 on
the coach's list).

### Entities
- **READS:** `EngineSettings.tiers` and `.ordering` (`invitation_engine/settings.py`); from the
  `SessionSnapshot`: `waiting_list` (each entry's list, side or sides choice, `joined_at`), `pool`
  (visible students not in the session), `said_no`, each `Student`'s level, `sides`,
  `participations` and the group-rule facts of rule 13.
- **WRITES:** nothing.

### Rules
1. **Kinds of criteria (§3).** Every rule the coach set is one of: **gate** (failing means never
   invited automatically), **spectrum** (level, read against the class's level: a level rule passes or
   fails, rule 13, and ordering ranks the better level first, rule 8), **category** (side: the spot's
   value is in the student's subset or not), **tier criterion** (a student-only attribute that puts
   the student in a group), **ordering** (ranks candidates inside a tier) or **postpone** (delays a
   student without excluding them).
2. **The kind is read off the rule (§5.1).** An operation that refers to the spot (`*_vacancy`) on side
   is a category rule; on level a spectrum rule, evaluated against the class's level
   (`notifications.engine-spots` rule 8); every other group rule is a tier criterion. The priority
   list is ordering; eligibility rules, exclusions and blocks are gates; the daily cap and one live
   offer per club day are postpones. A group is a `Tier(source, side, level_offset)` (side `same`,
   `other` or `any`, a level offset from the class or none) carrying the stored group's rules (rule
   13; owner ruling D5); the mapping from the coach's stored config is `notifications.config` rule 19.
   For a tier built from a stored group, `side` and `level_offset` are derived from that group's own
   side and level rules by the mapping (`same_as_vacancy` gives `same` and 0, one above or below ±1, a
   range or no level rule none), so the two never disagree; the rules decide.
3. **Gates (D13; Q2 closed; ruling (3)).** Gates hold on **automatic candidates**: the students'
   waiting list and the coach's groups. Excluded by the coach, a disabled account, the student's own
   block on automatic invitations, already in the session, in another session at the same time
   (**at the same time**: another session **of the same coach** whose interval overlaps this one's at
   all (the owner's decision 11 of 2026-11-12), each session running from its start to its start plus
   the lesson's duration, which the store puts in the snapshot, a session ending exactly when the other
   starts not overlapping; **or a session of any coach with the same start** (the owner's ruling of
   2026-11-11, "nunca se quebra", which decision 11 widened within one coach and did not narrow). The code's and the wire's `same_hour` / `busy_same_time` names mean
   this. engine-answers rule 10, engine-planning rule 10 and rule 10 here use this one),
   already said No for this session, below the eligibility bar, an unpaid subscription when the coach
   excludes them. A gate is never relaxed to fill a class. The store applies the gates it can decide
   alone when it builds `pool`; `said_no` and "another session at the same time" are snapshot facts.
4. **The coach's list is the coach's decision (ruling (3)).** A student the coach put on the coach's
   list, eligible or not, is a member of group 0a and is placed or invited like any other member; only
   "already in the session", "said No for this session" and the student's own choices still apply: a
   block on automatic invitations or on all notifications (`notifications.student-block-preferences`
   rule 5) and an availability blocker over the class (`calendar.student-blockers` rule 5) keep them out
   of `pool` on the coach's list too. The coach decides who is asked, never over the student's own
   "do not ask me". Students still see only the
   classes they are eligible for.
5. **Tiers (§2, §5, D12; Q7 closed).** In order: the coach's list, the students' list, then the coach's
   groups in the coach's order.
6. **The waiting lists have no level rules (D12).** A waiting-list member is a candidate for every spot
   type whatever their level. Sides: a coach's-list entry with a side the coach chose (today's
   `notifications.waiting-list` rule 18a) is a candidate only for spot types that side can take; one
   without a side, for every type. A students'-list member who chose a side when joining (today's
   route carries left, right or both, PAD-672) is a candidate for the types that choice allows, read as
   own, other or both (`notifications.engine-settings` rule 4); one who chose none, for every type.
7. **A candidate's tier is per spot type (§5).** For a type, the first tier whose rules the student
   passes. One student may be tier 2 for the left type and tier 3 for the right.
8. **Ordering inside a tier (§3; Q4 closed: PAD-723).** `EngineSettings.ordering` is the coach's
   enabled priority criteria followed by the coach's enabled tiebreakers, each list in the coach's
   order (built from the stored configuration, `notifications.config` rule 19). Each id ranks one way:
   `level` the better level first, an unknown level last (today's `_level_sort_key`); `justified_misses` more classes owed first
   (`attendance.stats` rule 4); `attendance` and `attendance_rate` higher rate first; `playing_side`
   and `playing_side_match` a student whose only side is the spot's side first, then one who plays
   both, then the rest, and a spot of either side favours nobody (today's `_side_preference_rank`);
   `subscription_status` an active account first; `unjustified_absences` fewer first;
   `justified_absences` more first; `participations` (the scenario harness's own) more first. Then, on
   the waiting lists, `joined_at`; then a stable order. An id outside this list is refused when the
   settings are built (`SettingsError`). Today only the priority criteria rank
   (`_build_sort_key`, `notification_service.py:989`, called at `:1912`); the tiebreakers are stored
   and edited but rank nothing, although `notifications.invitations` rule 4 and `notifications.config`
   rule 8 say they do. Wiring them changes who is asked first for every coach with a tiebreaker on,
   which by default is three of them (`DEFAULT_TIEBREAKERS`); Open questions.
9. **Candidates are recomputed on every run (D8).**
10. **Postpone (D15).** A student blocked by the daily invitation cap, or holding a **counting**
    invitation for another session that club day, the same hour (rule 3) included
    (`notifications.invitations` rule 18c, as amended by PAD-911; Tomás calls a counting invitation
    "ativo"), is **not a candidate this run**. For this gate an invitation counts when it counts by
    `notifications.engine-planning` rule 3 (open, not sorry, before its counting-until instant) **and**
    its offer counts toward a current spot type of its own session by rule 4; so an invitation to a
    full session counts for nothing. An open invitation that does not count stays valid (D4) but
    postpones nobody (owner ruling 2026-11-11 on Tomás's point 2). A postponed student counts for no
    type, so they neither cover a spot nor make their tier the ideal one, and the next tier goes
    ahead. Their return once free is `notifications.engine-planning` rule 7, the one rule for it.
11. **One evaluator (recorded decision "invite simulation shares the engine pipeline", 2026-09-06).**
    The verdict that admits or drops a student and its explanation come from the same evaluator. When
    the engine ships, the invite simulation (`notifications.invite-simulation`) and the semi-automatic
    prompt run this spec's evaluator, never a copy of it.
12. **The dry run (swap plan §4; PAD-915).** `planner.evaluate(snapshot, settings, now)` plans a
    snapshot without applying anything and returns the effects `plan` would emit, a verdict per
    student the snapshot names per open spot type, each type's queue (its candidates by tier, then by
    rule 8), and whether the run may plan now (false outside the window or in quiet hours, when the
    effects are empty and the verdicts still explain). A verdict's stage is the first failure in this
    spec's order, with no tier: `in_session`, `said_no`, `removed_by_coach` (the coach removed them
    from a semi-automatic request for this session, `notifications.engine-planning` rule 14; the
    snapshot carries the session's removed students), `not_in_pool`, `busy_same_time`, `postponed`,
    `failed_eligibility` (only where the engine's own bar is not wide open, as in the scenario harness;
    for an app session the bar is in `pool`, `notifications.config` CONFIG-60, so a student below it is
    `not_in_pool` and the caller explains why), `failed_tier_rule` (a coach's-list member skips the pool
    gates except the student's own blocks, rule 4, so it fails only as `in_session`, `said_no`,
    `removed_by_coach`, `not_in_pool` for a block, or `failed_tier_rule`); `invited_before` (their invitation
    for this session closed without a No, after an accept then a cancellation or by a same-hour
    placement: D1 allows no second one, so the run never reaches them); or, with its tier, `invited`
    (this run sends or reopens it with an offer that covers the type by side; an either type is
    covered by any side), `invited_for_other_type` (this run invites them for another type, and the
    offer does not cover this one), `invited_earlier` (an open invitation, not sorry) or `waiting` (a
    candidate this run does not reach). A type's queue leaves out `invited_before` and
    `invited_for_other_type`. The verdicts come from the planner's own candidate buckets (rule 11). Gates the app applies before the snapshot
    (exclusions, inactive accounts, eligibility per swap decision 6) never reach the engine; the
    caller explains those. A hypothetical ("this student drops out") is a snapshot the caller builds
    without writing. This is rule 11's evaluator, so the invite simulation and the engine agree.
13. **Tier criteria are the coach's group rules (owner ruling D5, 2026-11-11).** A pool tier carries
    its stored group's rules, one tier per group (`notifications.config` rule 19), and a student is in
    that tier for a spot type when they pass every rule, read as today's vacancy-anchored group rules
    (`_group_rule_failures`) with the class's level as the vacancy's: level `same_as_vacancy`,
    `one_above_vacancy`, `one_below_vacancy`, `all_above_vacancy`, `all_below_vacancy` on the coach's
    ladder (a student with no level, or a level off the ladder, fails; a class with no level applies
    no level rule, `notifications.engine-spots` rule 8 (D3), where today fails every level rule
    closed; a class level off the coach's ladder reaches the engine as no level
    (`notifications.engine-store` rule 4) and is read the same way, where today fails the range rules
    closed (`level_not_in_ladder`); these two are the only places the engine differs from today); side `same_as_vacancy` as the
    category rule (rule 2), and `different_from_vacancy` as an other-side tier (`notifications.config`
    rule 20, new-engine coaches only); `has_makeups` `is_true` (makeups owed above zero); `unjustified_absences`
    and `justified_absences` (counts of the coach's verdicts, D4) and `attendance_rate` (a percentage)
    compared by `less_than`, `less_than_or_equal`, `equals`, `greater_than` or
    `greater_than_or_equal`; `subscription_status` `equals`. As today, a threshold that is not a number
    passes, an unknown attribute passes, and an unknown operation passes except on level, where it
    fails (B-257). A group with no rules ("everyone") admits every pool student
    for every type. Only a pool tier carries group rules; settings giving rules to a waiting-list tier
    are refused (`SettingsError`). The snapshot's `Student` carries the facts these read, counted on the coach's own
    classes as today (PAD-382): level, sides, makeups owed, the two absence counts, attendance rate and
    subscription status. The class-anchored level operations (`*_class`: `same_as_class`,
    `equal_or_above_class`, `equal_or_below_class`, `one_below_or_above_class`, `within_n_*`) belong to
    the eligibility bar, which stays in the app (swap decision 6); a stored group that carries one is
    read as today, against the class's level.

### Not this spec
- How many invitations a tier sends (`notifications.engine-planning`).
- The settings screen for groups and criteria (unchanged, `notifications.groups`).
- Relaxing a gate to fill a class: a coach who wants a group below the bar changes the bar.

### Today
- Candidates are evaluated by `evaluate_candidates` (`backend/padel_app/services/notification_service.py:1652`)
  with group verdicts from `_group_rule_failures` (`:1210`), ranked by `_rank_invited` (`:1894`); side
  matching by `_side_eligible` (`:866`) and `_side_preference_rank` (`:887`); the "no" and live-offer
  gates by `_declined_player_ids` (`:1533`), `_still_invitable` (`:1508`), `_same_day_live_offers`
  (`:1630`), `_held_by_another_offer` (`:5741`); `notifications.invitations` rules 3–4d, 18, 18c.
- One waiting list as group 0, ranked by the coach's criteria, gated by eligibility like any group:
  `_waiting_list_candidates` (`:7467`), `notifications.waiting-list` rules 4–4e. Pinned by
  `test_pad446_waiting_list_group_zero.py`, `test_pad722_waiting_list_rules_pinned.py`,
  `test_pad723_*`, `test_pad803_coach_picks_the_waiting_list_side*`.
- Empty groups advance one per tick (`_defer_next_round`, `:5349`; rule 3c), pinned by
  `test_pad87_empty_rounds_per_tick.py`.
- The simulation shares the pipeline: `simulate_vacancy` (`backend/padel_app/services/invite_simulation_service.py:364`)
  and `compute_full_invite_queue` (`backend/padel_app/services/replacement_approval_service.py:85`).
- Not read beyond the function heads above.

### Acceptance Criteria

#### NOTIFICATIONS-ENGINE-TIERS-1: A student's tier is the first tier they pass for that spot type (rules 2, 7; §5)
Given tiers coach's list, students' list, (pool, same side, level 0), (pool, any side, level 0), a
level-3 class and a level-3 {left} student in the pool, when tiers are computed, then the student is
the third tier for the left type and the fourth for the right type.
test: `backend/padel_app/tests/test_invitation_engine_tiers.py` › `test_tier_is_first_tier_passed_per_spot_type`

#### NOTIFICATIONS-ENGINE-TIERS-2: The coach's list is asked before the students' list (rule 5; S22)
Given 4 left and 3 right regulars, Ana (right) on the coach's list, Bia (right) and Caio (left) on the
students' list, when the run plans, then Ana is invited and Bia and Caio are not; when Ana says No,
then Bia and Caio are invited and only Caio's message names the right side.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P22-coach-list-before-students-list]`

#### NOTIFICATIONS-ENGINE-TIERS-3: A students'-list member is a candidate whatever their side and level (rule 6; S23)
Given the only open spot is a right spot at level 3 and a level-2 left-sider on the students' list,
when the run plans, then the left-sider is invited before any group, the side named.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P23-waiting-list-ignores-side-and-level]`

#### NOTIFICATIONS-ENGINE-TIERS-4: No automatic tier invites a student who fails a gate (rule 3; S25)
Given three students on the students' list, one excluded by the coach (absent from `pool`), one in
another session at the same time, one in `said_no`, when the run plans, then none is invited.
test: `backend/padel_app/tests/test_invitation_engine_tiers.py` › `test_gates_hold_on_automatic_tiers`

#### NOTIFICATIONS-ENGINE-TIERS-5: A said-No student is not invited from the waiting list (rule 3; S25)
Given a waiting-list student who said No for this session, when a spot opens, then they are not invited.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P25-gates-hold-on-waiting-list]`

#### NOTIFICATIONS-ENGINE-TIERS-6: The coach's list is not gated by eligibility (rule 4)
Given the coach puts a student below the eligibility bar on the coach's list and a spot opens, when the
engine runs, then that student is placed or invited like any member of the coach's list.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[40-aluno-fora-dos-criterios-e-decisao-do-professor]`

#### NOTIFICATIONS-ENGINE-TIERS-7: Join time decides only the ties the coach's criteria leave (rule 8)
Given two students on the students' list, joined 10:00 and 11:00, and one spot with X = 1, when the
criteria rank them equal, then the 10:00 student is invited; when the criteria rank the 11:00 student
higher, then the 11:00 student is.
test: `backend/padel_app/tests/test_invitation_engine_tiers.py` › `test_join_time_breaks_only_criteria_ties`

#### NOTIFICATIONS-ENGINE-TIERS-8: A postponed student is no candidate this run (rule 10; S31)
Given the only group-1 candidate holds a live offer for another class that club day, X = 3, and group 2
has candidates, when the run plans, then group 2 is the type's ideal tier and gets X per spot; when the
other offer resolves, the group-1 student is invited on the next run if the type is below its budget
and the session below M.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P31-postponed-better-group-student]`

#### NOTIFICATIONS-ENGINE-TIERS-10: An invitation to a full class postpones nobody (rule 10; scenario 72)
Given scenario 72 (sessions A and B at the same hour, D1–D3 invited to A, D4 and D5 to B), when D1's Yes
fills A, then D2's and D3's invitations to A stay open but no longer count, and B's next run invites D2;
D2's Yes in B places them there and closes their invitation to A.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[72-duas-aulas-a-mesma-hora]`

#### NOTIFICATIONS-ENGINE-TIERS-9: The simulation's verdict for a student equals the engine's (rule 11)
Given each P01–P33 snapshot and each student in it, when the invite simulation explains the student and
the engine plans the session, then one admits the student exactly when the other does, at the same tier.
test: `backend/padel_app/tests/test_invitation_engine_tiers.py` › `test_simulation_and_engine_share_the_evaluator`

#### NOTIFICATIONS-ENGINE-TIERS-11: Ordering applies its ids in their order; an unknown id is refused (rule 8)
Given `ordering` with several ids, when candidates of one tier are ordered, then the first id decides
and each later id breaks only the ties the ones before it leave, in the given order; and settings
built with an unknown id are refused with `SettingsError`.
test: `backend/padel_app/tests/test_invitation_engine_tiers.py` › `test_ordering_is_priority_criteria_then_tiebreakers_in_the_coachs_order`

#### NOTIFICATIONS-ENGINE-TIERS-12: Each ordering id ranks its own way, ties falling to the next (rule 8)
Given two candidates in one tier who differ only in the stat one id reads, when that id alone orders
them, then the one rule 8 puts first is invited first; and when they are equal on every id, a
waiting-list member who joined earlier goes first.
test: `backend/padel_app/tests/test_invitation_engine_tiers.py` › `test_each_ordering_id_ranks_in_its_direction`

#### NOTIFICATIONS-ENGINE-TIERS-13: The dry run gives each student a verdict per spot type and plans what plan would (rule 12)
Given a snapshot with students failing each gate, a coach's-list member, an either spot, and invited,
invited-for-another-type, invited-before, removed-by-the-coach, earlier-invited and unreached
candidates, when it is evaluated, then each student has one verdict per open spot type with the first
failing stage in rule 12's order or its tier, an either spot's invitee is `invited`, the queues leave
out `invited_before`, `invited_for_other_type` and `removed_by_coach`, the effects equal `plan`'s with nothing
applied, and outside the window or in quiet hours the effects are empty while the verdicts stand.
test: `backend/padel_app/tests/test_invitation_engine_tiers.py` › `test_dry_run_gives_each_student_a_verdict_per_spot_type`

#### NOTIFICATIONS-ENGINE-TIERS-14: A stored group admits exactly the students today's group rules admit (rule 13)
Given one group per attribute and operation of rule 13, each with a student who passes and one who
fails, plus a threshold that is not a number, an unknown attribute and an unknown operation (on level
and on another attribute), when the engine computes tiers for a class at level L and `_group_rule_failures` is asked for the same students against a spot at L,
then each student is in the group's tier exactly when today's function returns no failure.
test: `backend/padel_app/tests/test_invitation_engine_tiers.py` › `test_group_rules_give_todays_verdict_for_every_rule_kind`

#### NOTIFICATIONS-ENGINE-TIERS-15: A group with no rules admits every pool student for every type (rule 13)
Given the reference groups (level same + side same; level same; no rules) and a pool student two levels
off the class who plays left, when tiers are computed for the left and right types, then the student is
in the "everyone" tier for both and in neither earlier group.
test: `backend/padel_app/tests/test_invitation_engine_tiers.py` › `test_a_group_with_no_rules_admits_every_pool_student`

#### NOTIFICATIONS-ENGINE-TIERS-16: A level range admits every level on its side of the class (rule 13)
Given a class at the middle level of a five-level ladder and a group `level all_above_vacancy`, when
tiers are computed, then students on either of the two stronger levels are in it, and students at the
class's level, one level weaker and with no level are not.
test: `backend/padel_app/tests/test_invitation_engine_tiers.py` › `test_level_ranges_admit_every_level_on_their_side_of_the_class`

#### NOTIFICATIONS-ENGINE-TIERS-17: A postponement added never drops one the store already had (rule 10)
Given a snapshot whose store-built `postponed` holds A, when the planner adds B as postponed for this run
(`planner.with_postponed`), then both A and B are postponed and neither is a candidate.
test: `backend/padel_app/tests/test_invitation_engine_tiers.py` › `test_the_stores_postponed_students_stay_postponed`

#### NOTIFICATIONS-ENGINE-TIERS-18: A class with no level applies no level rule of a group (rule 13; engine-spots rule 8)
Given a class with no level and a group `level same_as_vacancy` + `side same_as_vacancy`, when tiers are
computed for a right spot, then every right-fitting pool student is in that group's tier whatever their
level, although today's `_group_rule_failures` fails them all (`class_has_no_level`).
test: `backend/padel_app/tests/test_invitation_engine_tiers.py` › `test_a_class_with_no_level_applies_no_group_level_rule`

#### NOTIFICATIONS-ENGINE-TIERS-19: The coach's list never overrides the student's own blocks (rule 4)
Given three students on the coach's list, one blocking automatic invitations, one blocking all
notifications and one blocking only manual invitations, and a fourth with an availability blocker over
the class, when the store builds the snapshot and the run plans, then only the manual-only blocker is
in `pool` and invited; the others are `not_in_pool`.
test: `backend/padel_app/tests/test_pad916_engine_store.py` › `test_the_students_own_blocks_hold_on_the_coachs_list`

#### NOTIFICATIONS-ENGINE-TIERS-20: Any overlap with the same coach's class, or the same start with any coach, is busy (rule 3)
Given a 60-minute session at 19:00 and a student going to the same coach's 90-minute class at 18:00, a
second going to the same coach's class at 20:00, a third going to another coach's class at 19:00, and a
fourth going to another coach's class at 18:30, when the dry run evaluates them, then the first is
`busy_same_time` (18:00–19:30 overlaps 19:00–20:00), the third is too (the same start), and the second
and fourth are not (touching; another coach's class with a different start).
test: `backend/padel_app/tests/test_invitation_engine_tiers.py` › `test_any_overlap_with_the_same_coachs_class_is_busy`

#### NOTIFICATIONS-ENGINE-TIERS-21: A side chosen for the waiting list binds whatever wl-sides says (rule 6)
Given `wl-sides` off and on the students' list a right-sider who chose "other" and one who chose nothing,
when a right spot and a left spot open, then the first is a candidate (and placed or invited) only for the
left, and the second for both.
test: `backend/padel_app/tests/test_invitation_engine_tiers.py` › `test_a_side_chosen_for_the_waiting_list_binds_whatever_wl_sides_says`

### Waves
Cross-spec order: `notifications/_overview.md`, "Engine waves".
1. (W2) TIERS-1, TIERS-4, TIERS-7 — `invitation_engine/planner.py` (tiers, gates, ordering),
   `invitation_engine/snapshot.py` (a `busy_same_time` set and a `postponed` set beside `said_no`:
   shared-module change, with `adapters/new.py` and `store.py`).
2. (W7) TIERS-2, TIERS-3, TIERS-5, TIERS-6, TIERS-8 — scenario pins after planning W5 and answers W3.
3. (Swap) TIERS-9 — `invite_simulation_service.py`, `replacement_approval_service.py`; at the engine
   swap, not in this ticket (brief §1). Tier criteria and the stored-config mapping: wave 7.
4. (PAD-911) TIERS-10 — `invitation_engine/store.py` and `invitation_engine/planner.py` (`postponed`
   from invitations that count by planning rule 3 and whose offer counts toward a current spot type of
   their own session by rule 4: `timeline.counting` and the session's open spots together).
5. (Swap 3, PAD-915) TIERS-11, TIERS-12 — `invitation_engine/settings.py` (the ids and `SettingsError`),
   `invitation_engine/planner.py` (the sort key), the config mapping (swap plan §2).
6. (Swap 3, PAD-915) TIERS-13 — `invitation_engine/planner.py` (`evaluate`, `DryRun`, `Verdict`).
7. (Swap, PAD-915) TIERS-14, TIERS-15, TIERS-16, TIERS-18 — `invitation_engine/settings.py` (`Tier` carries the
   group's rules; a pool tier with `level_offset` none), `invitation_engine/snapshot.py` (`Student`
   gains the facts of rule 13), the tier evaluator in `invitation_engine/planner.py`; then (PAD-917)
   `notifications.config` CONFIG-57 and CONFIG-59, and (PAD-916) the store fills the facts.
8. (PAD-915) TIERS-17 — `invitation_engine/planner.py` (`with_postponed` takes the union).

### Open questions
- A coach's-list entry with a coach-chosen side (rule 6) versus D12's "no spot-type rules" — decision
  (owner away): keep the coach's side, because it is the coach's explicit choice (ruling (3)'s logic),
  today's behaviour (PAD-803) and what the skeleton's `WaitingListEntry.side` carries.
- A student with no level on a waiting list or in the pool (scenarios 23, 26, 34): the eligibility bar
  treats a missing level as the class's level, as the harness does (design §2.2) — decision (owner
  away), because no scenario expects such a student to be gated.
- Sessions that overlap without sharing a start (one at 10:00 for 90 minutes, one at 10:30): the same
  hour or not? (PAD-911; rule 3) — first decided "not" (owner away, then the coordinator's D-E26);
  **reversed by the owner (2026-11-12, Codex decision 11):** "we should check for the whole timeline …
  classes that overlap even a little bit", for the same coach. A session that ends exactly when another
  starts does not overlap: S's reading (PAD-913, 2026-11-12; the owner can reverse it), because nothing
  of the two classes happens at once. Another coach's class with the same start stays busy: decision 11
  widened the 2026-11-11 ruling ("never two sessions at the same hour") within one coach and did not
  narrow it; S's reconciliation of the two (PAD-913, after the fresh review), for the owner to confirm. **Later extension, not decided:** the same club's other coaches
  ("same club eventually"); travel buffers between classes.
- Where eligibility is decided after the swap (swap decision 6) — options: the coach's rule language
  (`eligibilityRules`) mapped into `EngineSettings.eligibility`; kept in the app. Decision (coordinator, owner away, PAD-912, 2026-11-11; the owner can reverse it): kept in the
  app; the store builds `pool` with `effective_eligibility` and the engine's bar is set wide open,
  because the engine's two integers cannot express today's rules and the app already evaluates them.
- The same hour (rule 3) — Decision (coordinator, owner away, PAD-912, 2026-11-11): the same start
  (D-E26); reversed by the owner's decision 11 (above).
- Wire the tiebreakers into the engine's ordering (rule 8) — options: priority criteria only, as today's
  code; priority criteria then tiebreakers, as today's specs say. Decision (S, owner away, PAD-913;
  the owner can reverse it): wire them, because `notifications.invitations` rule 4 and
  `notifications.config` rule 8 already promise it, and coaches edit them in settings; the behaviour
  change (three tiebreakers on by default) goes to the owner's review pack.
- Tier criteria (rule 2 left them to the swap; swap decision 5) — options: the plan's tiers (side and
  one level offset) only; today's group rule language. Decision (owner, 2026-11-11): today's language,
  "it cannot be well built if it doesn't take into account these important rules"; a stored group maps
  to one tier (rule 13). Reading them as today's `_group_rule_failures`, unparseable thresholds and
  unknown operations passing included, is S's (PAD-913), so no coach's group changes meaning at the
  cutover.
- The waiting lists as two groups, and the coach's list past the gates (rules 4, 5) — **the owner's
  answers (2026-11-12, waiting-list inspection questions 2 and 3, both "matches Tomás"):** two groups,
  the coach's list first with the usual wait before the students' list; the coach's list skips the
  eligibility bar and the coach's own gates (the student's own blocks still hold, rule 4). Today has
  one list with no coach priority and every gate.
- One tier per stored group with all its criteria, and the timing between groups (rule 13) —
  **confirmed by the owner** (Codex decision 4, 2026-11-12): "if we ensure that we do keep all the
  criteria from the coach … and we keep the timings in the separation between groups, … that's fine."
- A better-tier candidate who appears later is considered again (rule 9; `notifications.engine-planning`
  rule 7) — **confirmed by the owner** (Codex decision 9, 2026-11-12), the coach-added waiting-list
  example included.
