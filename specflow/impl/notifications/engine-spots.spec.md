---
id: notifications.engine-spots
status: draft
depends_on: [classes.instance-enrollment, levels.coach-levels]
serves: [P-NOTIFICATIONS-8]
governed_by: []
---

# notifications.engine-spots

### Intent
What a class session needs, counted from scratch on every planning run of the redesigned engine
(PAD-899; plan `docs/plans/invitation-engine-redesign.md` §2, §4, D1–D3, D18, D19; owner's ruling
of 2026-11-11). Spots are counts derived from capacity and the students going, not rows that open
and close, so a spot with no regular and a spot freed by an absence are filled by the same logic.

### Entities
Stated as the engine's observable inputs; storage is the engine package's (PAD-902).
- **READS:** `SessionSnapshot` (`invitation_engine/snapshot.py`): capacity, level (effective level by
  `notifications.invitations` rule 2a), `regulars`, `going` placements with their side, `absent`,
  each `Student`'s `sides` subset and level.
- **WRITES:** nothing. The counts are recomputed on every run.

### Rules
1. **A session is one date of a class (§2).** Every count below is per session.
2. **Going (§2).** Regulars who have not said they are not coming, plus students who accepted an
   invitation, joined directly or were placed from a waiting list for this session.
3. **Categories and subsets (D18).** Side is a category with the values left and right. Each student
   holds a non-empty subset: {left}, {right} or {left, right}, and fits a value in it. A student is
   flexible when their subset covers more than one value with an open spot. Other categories work
   the same way and have no quota yet.
4. **Side's quota is const:SIDE_QUOTA per side (D19).** Not a setting. Capacities are even (Q5,
   closed by the ruling).
5. **A going student counts under a value only once placed on it (§4).** A {left, right} regular the
   coach has not placed counts under neither side until `last_invite_at`
   (`notifications.engine-timeline` rule 6). A student placed by a Yes counts under the side they were
   placed on (S15); one placed by an either-side offer may still be moved at `last_invite_at` (§7).
6. **The counts (§4), per quota category:**
   ```
   class_empty = capacity − all going students
   open(v)     = max(0, quota(v) − going students placed on v)
   must(v)     = max(0, class_empty − Σ open(w) for every w ≠ v)
   either      = class_empty − Σ must(v)
   ```
   The number to invite is never read from `open(v)` alone: `Σ open(v) = class_empty + flexible
   going students`.
7. **Spot types (D2).** The `must(v)` types plus `either`, each at the class's level. A `must(v)`
   spot takes only a student who fits v; an `either` spot anyone who fits a value with
   `open(v) > 0`, within `open(v)`. For a category rule (`notifications.engine-tiers` rule 2), an
   `either` spot's value is every v with `open(v) > 0`: "same side" admits a student who fits any of
   them, "other side" admits nobody.
8. **A spot's level is the class's level (D3)**, never the departing player's. A class with no level
   applies no level rule.
9. **Flexible going students (§4).** {left, right} students the coach has not placed. A one-sided
   regular above a value's quota keeps their spot and their side (the owner, 2026-11-12, decisions 12
   and 13): they count under their side, and the other side's open spots are only the seats the class
   has left. Who moves, and when, is `notifications.engine-timeline` rule 6. Total regulars never exceed
   capacity.
10. **One logic for both reasons (§4).** A spot with no regular and a spot freed by an absence are the
    same to the engine; only the coach's view and attendance records tell them apart. The one exception
    is `fill_never_held` off (`notifications.engine-settings` rule 11), which keeps today's invitation
    start `none`: then only freed spots are invited for.

### Not this spec
- Who is asked for a spot type (`notifications.engine-tiers`) or how many (`notifications.engine-planning`).
- Persisting spots: there is no vacancy row in the new engine (D1).
- Odd capacities and quota categories other than side.

### Today
- Free seats are `LessonInstance.effective_filled_spots` against capacity, and every open spot is a
  `Vacancy` row created by `trigger_invitations` (`backend/padel_app/services/notification_service.py:5635`),
  closed by `_close_vacancy` (`:5856`) and reconciled with capacity by `vacancies_after_class_edit`
  (`:5918`) and the tick `process_invitation_batches` (`:6117`); `notifications.invitations` rules 1d,
  13, 13a, 14. Pinned by `test_pad271_*`, `test_pad763_*`.
- A spot's side comes from balancing: `_side_counts` (`:3378`), `_rebalanced_side` (`:3421`),
  `_open_vacancy_sides` (`:3291`); rules 2b–2d. Pinned by `test_pad421_*`,
  `test_pad565_side_balance_non_full_class.py`, `test_pad825_side_counts_parts.py`,
  `test_pad551_side_per_occurrence.py`, `test_pad581_*`.
- A spot's level is the departing player's, `_vacancy_level` (`:505`), rule 2; pinned by
  `test_pad801_one_verdict_per_run.py`.
- A class with no level fails every level rule closed (rule 4d), in `_group_rule_failures` (`:1210`);
  pinned by `test_effective_level_resolution.py:339`, `test_pad128_eligibility.py:182`,
  `test_pad133_eligibility_reasons.py:204`. SPOTS-7 reverses this at the engine swap.
- Not read beyond the function heads above. The new counts land in `invitation_engine/planner.py`
  (the skeleton's owner of "going counts and spot types"); `snapshot.py` stays rule-free input.

### Acceptance Criteria

#### NOTIFICATIONS-ENGINE-SPOTS-1: With one side full, every missing spot is must of the other side (rule 6)
Given capacity 8 with 4 left regulars going and none on the right, when the counts are computed,
then `class_empty` 4, `open(L)` 0, `open(R)` 4, `must(R)` 4, `must(L)` 0, `either` 0.
test: `backend/padel_app/tests/test_invitation_engine_spots.py` › `test_one_side_full_makes_every_spot_must_of_the_other`

#### NOTIFICATIONS-ENGINE-SPOTS-2: An unplaced flexible regular turns one must spot into either (rules 5, 6)
Given capacity 8 with 2 left, 3 right and 1 unplaced {left, right} regular, when the counts are
computed, then `class_empty` 2, `open(L)` 2, `open(R)` 1, `must(L)` 1, `must(R)` 0, `either` 1.
test: `backend/padel_app/tests/test_invitation_engine_spots.py` › `test_unplaced_flexible_regular_makes_one_either_spot`

#### NOTIFICATIONS-ENGINE-SPOTS-3: Σ open(v) equals class_empty plus the flexible going students (rule 6)
Given capacity 8 with 2 left, 2 right and 3 unplaced {left, right} regulars, when the counts are
computed, then `class_empty` 1, `open(L)` 2, `open(R)` 2, `either` 1, and `open(L) + open(R)` =
`class_empty` + 3.
test: `backend/padel_app/tests/test_invitation_engine_spots.py` › `test_open_sum_is_class_empty_plus_flexible`

#### NOTIFICATIONS-ENGINE-SPOTS-4: A side over its quota makes its extra regular flexible (rules 6, 9)
Given capacity 8 with 1 left and 5 right regulars, when the counts are computed, then `must(L)` 2,
`open(R)` 0, `either` 0, and one right regular is a flexible going student.
test: `backend/padel_app/tests/test_invitation_engine_spots.py` › `test_side_over_quota_makes_one_regular_flexible`

#### NOTIFICATIONS-ENGINE-SPOTS-5: An absence and a never-held spot produce the same invitations (rule 10; S17)
Given capacity 8 with 3 left and 3 right regulars and X = 3, when a left regular says No before the
cutoff, then the next run invites 6 left-siders and 3 right-siders, as it would for 2 left and 3 right
regulars with no absence.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P17-both-kinds-of-open-spot]`

#### NOTIFICATIONS-ENGINE-SPOTS-6: The spot's level is the class's whoever left (rule 8; S26)
Given a level-3 class whose level-4 regular says No, when the run plans, then the open spot is a
level-3 spot and a same-level group invites level-3 students for it, not level-4 ones.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P26-level-from-the-class]`

#### NOTIFICATIONS-ENGINE-SPOTS-7: A class without a level filters nobody by level (rule 8; S27)
Given a class with no level and a same-level, same-side group, when its candidates for a right spot are
computed, then every right-fitting student in the pool is one, whatever their level.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P27-class-without-a-level]`

#### NOTIFICATIONS-ENGINE-SPOTS-8: An either spot's category value is every open side (rule 7)
Given capacity 8 with 2 left, 2 right and 3 unplaced {left, right} regulars (one either spot), a
same-side group and an other-side group, when candidates are computed, then left-siders and
right-siders are both same-side candidates and the other-side group has none.
test: `backend/padel_app/tests/test_invitation_engine_spots.py` › `test_either_spot_side_rules`

### Waves
Cross-spec order: `notifications/_overview.md`, "Engine waves".
1. (W1) SPOTS-1, SPOTS-2, SPOTS-3, SPOTS-4, SPOTS-8 — `invitation_engine/planner.py` (a pure count
   function over `SessionSnapshot`), `const:SIDE_QUOTA`.
2. (W7) SPOTS-5, SPOTS-6, SPOTS-7 — scenario pins; they pass once planning W5 and answers W3 land.

### Open questions
- A class with no level: no level rule (D3, "to revisit later") or today's fail-closed (rule 4d)? —
  decision (owner away, coordinator approves tonight): D3, because the plan says so and S27 pins it.
- SPOTS-7's scenario `P27-class-without-a-level` — closed (coordinator, 2026-11-11): the scenario format
  gained a nullable `class.level` (H, on the P-file branch), so SPOTS-7 stays a scenario pin.
- More than one quota category: the plan solves the counts per combination as a matching (§4); no
  scenario needs it, so it is out of this spec.
