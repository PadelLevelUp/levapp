---
id: notifications.engine-settings
status: draft
depends_on: [notifications.engine-planning, notifications.engine-tiers, notifications.engine-timeline, notifications.config]
serves: [P-NOTIFICATIONS-8]
governed_by: []
---

# notifications.engine-settings

### Intent
The coach's settings the redesigned engine reads (PAD-899), including the rules from Tomás's scenario
suite that become settings beside the plan: engine wave brief of 2026-11-11 §2 clause 3 (the plan is
silent, the PDF describes a coach rule: a setting) and clause 2 (a PDF rule that contradicts a plan
mechanic is not one). **Every setting defaults to the plan's behaviour**: a coach who changes nothing
gets plan §1–§8. The list matches H's disposition sheet (`timing`, `auto-entry`, `wl-sides`,
`direct-join`, `other-side-groups`, `group-order`, `reminders`, `cutoff`; `tie-rule` is engine
behaviour, `notifications.engine-planning` rule 13). Backend only in this wave (brief §1).

### Entities
- **READS/WRITES:** `EngineSettings` (`invitation_engine/settings.py`, PAD-902). At the engine swap it is
  built from the coach's `NotificationConfig` (`notifications.config`).

### Rules
1. **X and M (§2, D16).** `invites_per_spot` (default 3) and `max_at_a_time` (default 12).
2. **`timing` (ruling D-E6; coordinator ruling (c)).** Every invitation's T is fixed at send
   (`notifications.engine-timeline` rule 4) from one of:
   - **fixed** (the PDF's Method A, the default): `between_rounds` and `between_groups`, one pair for
     all tiers; default both 20 minutes, which is the plan's single T;
   - **per tier** (Method C): a pair per tier; a tier without its own pair uses the fixed pair;
   - **progressive** (Method B, one round per tier): the engine computes, at send, the tier's share of
     the useful time — from `first_invite_at` to `last_invite_at`, quiet hours excluded — over the tiers
     that have candidates at that send, by const:METHOD_B_PART; every invitation of that tier gets its
     tier's share as T.
   Each value is at least const:ENGINE_T_FLOOR; a lower value is refused when saved.
3. **`auto-entry`** (`auto_entry_before_attendance_request`, default off). When on, before
   `attendance_request_at` — the invitation window not required — a waiting-list member is **placed**
   in a spot that opens and that they can take (a coach's-list entry: the coach's side, or any; a
   students'-list entry: their subset, narrowed by rule 4 when on), without an invitation, and gets
   const:KIND_ADDED; they then get the reminder like a regular. The coach's list goes first, then the
   students' list, each by `notifications.engine-tiers` rule 8. From `attendance_request_at` on,
   waiting-list members are invited as group 0, as with the setting off. Their No later is not an
   absence and takes them off the session's waiting list.
4. **`wl-sides`** (`waiting_list_side_choice`, default off; D12: group 0 has no spot-type rules). When
   on, a student joining the students' list chooses own side, other side or both, and is a candidate
   only for the spot types that choice allows; an other-side invitation or placement names the side
   (D11).
5. **`direct-join`** (`direct_join`, default off: the plan has none). When on, an eligible student who
   sees the session with a spot on a side they fit joins it at once, any time until the class starts:
   before the invitation start, alongside open invitations, and after their own No to an invitation
   (the "said No" gate is about invitations). With their side full the join is refused and only the
   waiting list is offered. At the engine swap it is set from the coach's `auto_accept_join_requests`.
6. **`other-side-groups`.** A tier with `side: other` (`settings.Tier`): for a spot of value v it admits
   students whose subset does not contain v; for an `either` spot it admits nobody
   (`notifications.engine-spots` rule 7). The invitation names the side (D11). The PDF's base groups 5
   and 6 use it.
7. **`group-order`, `reminders`, `cutoff`.** The coach orders the tiers (`EngineSettings.tiers`); reminder
   times, interval and count (`EngineSettings.attendance_request`, as `notifications.reminders`); the
   absence cutoff's hours (`absence_cutoff_before`). The justified-or-unjustified decision is the plan's
   (`notifications.engine-timeline` rule 5).
8. **Kept unchanged:** invitation start, last invitation, quiet hours, eligibility, restrictions, the
   daily per-student cap and one live offer per club day (postpones, D15), priority criteria.

### Not this spec
- A settings screen on web or iOS (brief §1: backend only in this wave).
- A between-groups clock that overrides coverage (contradicts D9, D16), and Method B's decreasing
  rounds inside one tier (scenario 84, `deferred` on H's sheet).

### Today
- X is `maxSimultaneous` per vacancy; there is no M (only `maxTotal`, `_check_restrictions`,
  `backend/padel_app/services/notification_service.py:2167`); one `maxInactiveTime` with a 15-minute
  floor (`MIN_INACTIVE_MINUTES`, `backend/padel_app/models/notification_config.py:382`); `notifications.config`.
- No automatic entry: removed by PAD-446 (`notifications.waiting-list` rules 4, 4d, 17); pinned by
  `test_pad446_waiting_list_group_zero.py`, `test_pad722_waiting_list_rules_pinned.py`.
- Waiting-list entries carry a side since PAD-672 (`notifications.waiting-list` rules 4e, 18a), no
  own/other/both choice; pinned by `test_pad672_side_on_requests_and_waiting_list.py`,
  `test_pad803_coach_picks_the_waiting_list_side*`.
- Direct join is a join request accepted automatically when `auto_accept_join_requests` is on
  (`backend/padel_app/services/class_join_request_service.py:316`; the setting at
  `notification_service.py:187`, `:322`–`:324`; `classes.join-requests`).
- Group rules have `same_as_vacancy` for side and no opposite (`_side_eligible`, `notification_service.py:866`).
- The skeleton's `settings.Timing` has `method` (`fixed|progressive|per_tier`), one `inactivity` and
  `per_tier`; the `new` adapter turns automatic entry, side choice and direct join on for every
  scenario (`adapters/new.py`).

### Acceptance Criteria

#### NOTIFICATIONS-ENGINE-SETTINGS-1: Per-tier timing gives each tier its own T (rule 2)
Given a timing pair per tier (Method C), when a tier's invitations go out, then each carries its tier's
`between_rounds` or `between_groups` by `notifications.engine-timeline` rule 4.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[88-cada-grupo-com-os-seus-tempos]`

#### NOTIFICATIONS-ENGINE-SETTINGS-2: A one-minute round runs at the floor (rule 2)
Given `between_rounds` at const:ENGINE_T_FLOOR and nobody answering, when the run continues, then a new
round goes out each const:ENGINE_T_FLOOR.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[90-tempo-minimo-entre-rondas]`

#### NOTIFICATIONS-ENGINE-SETTINGS-3: A value below the floor is refused (rule 2)
Given a timing value below const:ENGINE_T_FLOOR, when the settings are built, then they are refused with
a `SettingsError`.
test: `backend/padel_app/tests/test_invitation_engine_settings.py` › `test_timing_below_the_floor_is_refused`

#### NOTIFICATIONS-ENGINE-SETTINGS-4: Method B shares follow the parts and leave the last tier two thirds of the first (rule 2)
Given useful time U and n tiers with candidates, when T is computed at send, then tier i's T is U ×
(3(n−1) − i) / Σ parts for n ≥ 2 (4 tiers: 9:8:7:6), U for n = 1, and the last tier's share is two
thirds of the first's.
test: `backend/padel_app/tests/test_invitation_engine_settings.py` › `test_method_b_parts`

#### NOTIFICATIONS-ENGINE-SETTINGS-5: Method B with four tiers (rule 2)
Given scenario 83 (four tiers, one round each), when it runs, then each tier's invitations go out when
the previous tier's T runs out, by the 9:8:7:6 shares.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[83-quatro-grupos-com-menos-tempo-nos-ultimos]`

#### NOTIFICATIONS-ENGINE-SETTINGS-6: Automatic entry places before the reminder hour and invites after it (rule 3)
Given `auto-entry` on and a waiting-list member, when a spot they can take opens before
`attendance_request_at`, then they are placed and get const:KIND_ADDED; when one opens after it, then
they are invited as group 0.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[23-mesmo-antes-e-mesmo-depois-dos-lembretes]`

#### NOTIFICATIONS-ENGINE-SETTINGS-7: An automatically placed student's No is no absence (rule 3)
Given `auto-entry` on and a student placed by it, when they say No, then no absence is recorded and they
leave the session's waiting list.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[26-quem-entrou-automaticamente-diz-nao]`

#### NOTIFICATIONS-ENGINE-SETTINGS-8: A side-bound entry is a candidate only for the sides it chose (rule 4)
Given `wl-sides` on and a student who chose "other side only", when only a spot of their own side opens,
then they are not invited or placed for it.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[34-waiting-list-so-para-o-lado-contrario]`

#### NOTIFICATIONS-ENGINE-SETTINGS-9: A direct join takes an open spot of the joiner's side, even after their No (rule 5)
Given `direct-join` on, when an eligible student who said No to an invitation joins a session with a
spot on their side, then they are going at once.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[44-quem-recusou-muda-de-ideias]`

#### NOTIFICATIONS-ENGINE-SETTINGS-10: A direct join to a full side is refused (rule 5)
Given `direct-join` on and the student's side full while the other has a spot, when they try to join,
then the join is refused and only the waiting list is offered.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[32-lado-cheio-mas-vaga-no-outro-lado]`

#### NOTIFICATIONS-ENGINE-SETTINGS-11: An other-side tier admits exactly the students whose subset lacks the spot's side (rule 6)
Given a level +1 tier with `side: other`, a right spot, a level-2 left-sider, a level-2 right-sider and a
level-2 {left, right} student, when the run reaches that tier, then only the left-sider is its candidate
and their message names the right side.
test: `backend/padel_app/tests/test_invitation_engine_settings.py` › `test_other_side_tier_admits_only_the_other_side`

#### NOTIFICATIONS-ENGINE-SETTINGS-12: An other-side tier gets the lower tier's share (rule 6; scenario 5)
Given scenario 5 as re-derived on PAD-900, when the same-side tiers still count and a spot is uncovered,
then the other-side tier invites const:LOWER_TIER_PER_SPOT left-sider per uncovered spot, the right side
named.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[05-grupo-com-menos-alunos-do-que-vagas]`

#### NOTIFICATIONS-ENGINE-SETTINGS-13: The coach's tier order is the order asked (rule 7)
Given tiers reordered to same level before one level above, when the run plans, then same-level students
are invited first.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[08-professor-prefere-mesmo-nivel]`

#### NOTIFICATIONS-ENGINE-SETTINGS-14: With no setting changed, the engine is the plan (all rules)
Given `EngineSettings()` defaults and the `new` adapter's defaults mode (no coach rule turned on), when
the plan scenarios P01–P33 run, then each passes.
test: `backend/padel_app/tests/test_invitation_engine_settings.py` › `test_defaults_are_the_plan`

### Waves
Cross-spec order: `notifications/_overview.md`, "Engine waves".
1. (W1) SETTINGS-3, SETTINGS-4 — `invitation_engine/settings.py` (the timing shape of rule 2, the floor,
   `const:METHOD_B_PART`), with TIMELINE W1's shared-module change.
2. (W7) SETTINGS-1, SETTINGS-2, SETTINGS-5, SETTINGS-11, SETTINGS-12, SETTINGS-13 —
   `invitation_engine/timeline.py` (T per tier, Method B at send), `invitation_engine/planner.py`
   (`side: other`, tier order).
3. (W8) SETTINGS-6, SETTINGS-7, SETTINGS-8 — `invitation_engine/planner.py` (automatic entry, the
   skeleton's owner), `invitation_engine/timeline.py` (the attendance-request boundary),
   `invitation_engine/answers.py` (list joins with a side choice), `const:KIND_ADDED`.
4. (W8) SETTINGS-9, SETTINGS-10 — `invitation_engine/answers.py` (direct join and its refusal).
5. (W8, last) SETTINGS-14 — `adapters/new.py` (a defaults mode: each coach rule on only for scenarios
   that use it).

### Open questions
- Is an automatically placed student's No also the "said No for this session" gate? — decision (owner
  away): yes for automatic invitations, as for any No; a direct join stays open to them (rule 5),
  because the gate is about invitations.
- `auto-entry` places a student without a Yes, which `notifications.waiting-list` rule 4 (owner,
  2026-10-03) forbids today — decision: a setting, off by default, because the owner's ruling of
  2026-11-11 (brief §2 clause 3) makes the PDF's coach rules settings where the plan is silent.
- `direct-join` defaults off in `EngineSettings` though many coaches have `auto_accept_join_requests` on
  today — decision: off is the plan's default; the swap maps each coach's stored value, so no coach's
  behaviour changes at the swap.
