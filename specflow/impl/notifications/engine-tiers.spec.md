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
  (visible students not in the session), `said_no`, each `Student`'s level, `sides` and
  `participations`.
- **WRITES:** nothing.

### Rules
1. **Kinds of criteria (§3).** Every rule the coach set is one of: **gate** (failing means never
   invited automatically), **spectrum** (level: closer is better), **category** (side: the spot's
   value is in the student's subset or not), **tier criterion** (a student-only attribute that puts
   the student in a group), **ordering** (ranks candidates inside a tier) or **postpone** (delays a
   student without excluding them).
2. **The kind is read off the rule (§5.1).** An operation that refers to the spot (`*_vacancy`) on side
   is a category rule; on level a spectrum rule, evaluated against the class's level
   (`notifications.engine-spots` rule 8); every other group rule is a tier criterion. The priority
   list is ordering; eligibility rules, exclusions and blocks are gates; the daily cap and one live
   offer per club day are postpones. In this wave a group is a `Tier(source, side, level_offset)`:
   side `same`, `other` or `any`, a level offset from the class. Tier criteria such as `has_makeups`
   and the mapping from the coach's stored config are the engine swap's.
3. **Gates (D13; Q2 closed; ruling (3)).** Gates hold on **automatic candidates**: the students'
   waiting list and the coach's groups. Excluded by the coach, a disabled account, the student's own
   block on automatic invitations, already in the session, in another session at the same time,
   already said No for this session, below the eligibility bar, an unpaid subscription when the coach
   excludes them. A gate is never relaxed to fill a class. The store applies the gates it can decide
   alone when it builds `pool`; `said_no` and "another session at the same time" are snapshot facts.
4. **The coach's list is the coach's decision (ruling (3)).** A student the coach put on the coach's
   list, eligible or not, is a member of group 0a and is placed or invited like any other member; only
   "already in the session" and "said No for this session" still apply. Students still see only the
   classes they are eligible for.
5. **Tiers (§2, §5, D12; Q7 closed).** In order: the coach's list, the students' list, then the coach's
   groups in the coach's order.
6. **The waiting lists have no level rules (D12).** A waiting-list member is a candidate for every spot
   type whatever their level. Sides: a coach's-list entry with a side the coach chose (today's
   `notifications.waiting-list` rule 18a) is a candidate only for spot types that side can take; one
   without a side, for every type. A students'-list member is a candidate for every type, unless the
   coach turns on `wl-sides` (`notifications.engine-settings` rule 4).
7. **A candidate's tier is per spot type (§5).** For a type, the first tier whose rules the student
   passes. One student may be tier 2 for the left type and tier 3 for the right.
8. **Ordering inside a tier (§3; Q4 closed: PAD-723).** The coach's priority criteria
   (`EngineSettings.ordering`), closest level first when the group's level rule is a range. On the
   waiting lists, `joined_at` breaks the ties the criteria leave.
9. **Candidates are recomputed on every run (D8).**
10. **Postpone (D15).** A student blocked by the daily invitation cap, or holding a **counting**
    invitation for another class that club day, the same hour included (`notifications.invitations`
    rule 18c, kept; Tomás calls a counting invitation "ativo"), is **not a candidate this run**. An
    open invitation that no longer counts — its class full, past its counting-until instant, or after
    sorry (`notifications.engine-planning` rules 3, 4) — stays valid (D4) but postpones nobody
    (owner ruling 2026-11-11 on Tomás's point 2). A postponed student counts for no type, so they
    neither cover a spot nor make their tier the ideal one, and the next tier goes ahead. Their return once free is `notifications.engine-planning` rule 7, the one
    rule for it.
11. **One evaluator (recorded decision "invite simulation shares the engine pipeline", 2026-09-06).**
    The verdict that admits or drops a student and its explanation come from the same evaluator. When
    the engine ships, the invite simulation (`notifications.invite-simulation`) and the semi-automatic
    prompt run this spec's evaluator, never a copy of it.

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

### Waves
Cross-spec order: `notifications/_overview.md`, "Engine waves".
1. (W2) TIERS-1, TIERS-4, TIERS-7 — `invitation_engine/planner.py` (tiers, gates, ordering),
   `invitation_engine/snapshot.py` (a `busy_same_time` set and a `postponed` set beside `said_no`:
   shared-module change, with `adapters/new.py` and `store.py`).
2. (W7) TIERS-2, TIERS-3, TIERS-5, TIERS-6, TIERS-8 — scenario pins after planning W5 and answers W3.
3. (Swap) TIERS-9 — `invite_simulation_service.py`, `replacement_approval_service.py`; at the engine
   swap, not in this ticket (brief §1). Tier criteria and the stored-config mapping (rule 2) too.
4. (PAD-911) TIERS-10 — `invitation_engine/store.py` (`postponed` from counting invitations only,
   with `invitation_engine/timeline.py`'s `counting`).

### Open questions
- A coach's-list entry with a coach-chosen side (rule 6) versus D12's "no spot-type rules" — decision
  (owner away): keep the coach's side, because it is the coach's explicit choice (ruling (3)'s logic),
  today's behaviour (PAD-803) and what the skeleton's `WaitingListEntry.side` carries.
- A student with no level on a waiting list or in the pool (scenarios 23, 26, 34): the eligibility bar
  treats a missing level as the class's level, as the harness does (design §2.2) — decision (owner
  away), because no scenario expects such a student to be gated.
