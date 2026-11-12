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
   - **progressive** (Method B): at each send the engine counts, per spot type, the
     n tiers taking part — the tiers with candidates for the type now, plus the tiers that sent an
     invitation for the type not yet answered No — and gives the sending tier, at rank r among them,
     parts[r] / sum(parts[r:]) of the useful time that remains at the send (const:METHOD_B_PART; the
     useful time runs from the opening, the first run that plans for the spot, to `last_invite_at`,
     quiet hours excluded). A tier that drops out
     (a whole tier refuses) re-splits the remaining time over the rest
     (`invitation_engine/timeline.py`, `method_b_t`).
     **The same parts set the rounds inside one tier (Tomás, 2026-11-11):** "os tempos descem em linha
     reta e o último recebe dois terços do primeiro". The tier's share and its number of rounds are
     fixed at the tier's first send, per spot type (the count: Open questions). Its last round waits
     the last third of the share, which is the between-groups wait to the next tier; the rounds before
     it split the other two thirds by const:METHOD_B_PART with n = rounds − 1 (2 rounds before the
     last: 3:2). A tier with one round waits its whole share; with two, two thirds then one third.
     **Every invitation of a round gets its round's wait as T**, fixed at send
     (`notifications.engine-timeline` rule 4, D-E6), the last round's being the between-groups share.
   Each value is at least const:ENGINE_T_FLOOR; a lower value is refused when saved.
3. **`auto-entry`** (`auto_entry_before_attendance_request`, default off). When on, before
   `attendance_request_at` — the invitation window not required — a waiting-list member is **placed**
   in a spot that opens and that they can take (a coach's-list entry: the coach's side, or any; a
   students'-list entry: their subset, narrowed by rule 4 when on), without an invitation, and gets
   const:KIND_ADDED; they then get the reminder like a regular. The coach's list goes first, then the
   students' list, each by `notifications.engine-tiers` rule 8. From `attendance_request_at` on,
   waiting-list members are invited as group 0, as with the setting off. Their No later is not an
   absence and takes them off the session's waiting list. **Automatic entry places only a student its
   list's tier would invite** (`notifications.engine-tiers` rules 3, 4, 10): a students'-list member
   must pass every gate (in the pool, not excluded, not blocked, not removed by the coach, not busy at
   that time, not postponed); a coach's-list member is still kept out by the student's own blocks, the
   coach's removal and being busy at that time.
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
   absence cutoff's hours (`absence_cutoff_before`), which only marks an absence on time or late
   (`notifications.engine-timeline` rule 5); justified or unjustified stays the coach's judgement (D4).
8. **Kept unchanged:** invitation start, last invitation, quiet hours, eligibility, restrictions, the
   daily per-student cap and one live offer per club day (postpones, D15), priority criteria.
9. **Settings per coach (swap decision 9, PAD-912).** The engine takes a lookup from a session to its
   coach's `EngineSettings` and asks it again for every session at every call (each session of a tick,
   each request it handles), so a coach's saved change applies from the next call. `UpdateSettings`
   then only re-plans the sessions the request names (the app names the coach's), or every session
   when it names none (the scenario harness).
10. **Timing shapes (swap plan §2; PAD-915).** `first_invite` and `attendance_request` each take the
    shape today's timing settings store, with today's meaning (`scheduler.py` `_fire_time_utc`):
    `hours_before` N is N real hours before the class's real start, across a clock change;
    `days_before` and `days_before_at_time` are the class's own wall date minus N days, at HH:MM on the
    club's clock (Lisbon, R-023); `none` starts invitations from the moment the session exists, and
    sends no attendance request; with it, `fill_never_held` (rule 11) is off, so as today only spots a
    student freed are invited for. With `attendance_request` `none`, automatic entry (rule 3, whose
    boundary is `attendance_request_at`) places until the class starts. The mapping from a coach's
    stored timing is therefore one for one.
11. **`fill_never_held`** (default on; the coordinator's ruling on today's `none`, PAD-918). When off,
    the planner invites only for spots a going student freed (an absent regular, a cancellation after
    accepting), never for spots no one held (`class_empty` beyond the freed ones): the session's
    planned open spots of each type are at most the spots freed on that type's side, a freed spot of a
    student who plays both sides counted as `either`. Each going student who is not a regular takes
    back one freed spot, their side's first, then an `either` one. Waiting-list placement by automatic entry and direct join follow the
    same limit. Today's coaches with invitation start `none` map to it off (`notifications.config`
    rule 19); every other coach maps to on, which is the plan (`notifications.engine-spots` rule 10).

### Not this spec
- A settings screen on web or iOS (brief §1: backend only in this wave).
- A between-groups clock that overrides coverage (contradicts D9, D16).

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

#### NOTIFICATIONS-ENGINE-SETTINGS-4: Method B gives the sending tier its part over the parts left, of the time left (rule 2)
Given n tiers taking part, the sending tier at rank r and a remaining useful time R at the send, when T
is computed, then T is R × parts[r] / sum(parts[r:]) with parts[i] = 3(n−1) − i (4 tiers: 9:8:7:6), R
for n = 1; with no tier dropping out the shares equal the 9:8:7:6 split of the whole useful time, and
the last tier's share is two thirds of the first's; and inside one tier of k > 1 rounds the last
round waits a third of the tier's share and the k − 1 rounds before it split the rest by the same
parts with n = k − 1.
test: `backend/padel_app/tests/test_invitation_engine_settings.py` › `test_method_b_parts`

#### NOTIFICATIONS-ENGINE-SETTINGS-5: Method B with four tiers (rule 2)
Given scenario 83 (four tiers, one round each; the opening at 15:30 and `last_invite_at` 08:30, so a
useful time of 17 h minus 7 h of quiet hours, 10 h), when it runs, then each tier's invitations go out
when the previous tier's T runs out: the first tier's T is 3 h (9/30 of 10 h), and at 18:30 the second
tier's is 2 h 40 (8/21 of the 7 h left).
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[83-quatro-grupos-com-menos-tempo-nos-ultimos]`

#### NOTIFICATIONS-ENGINE-SETTINGS-15: A whole tier refusing re-splits the time left over the rest (rule 2)
Given Method B and a tier taking part whose every invitee says No, when the next tier sends, then its T
is its part over the parts of the tiers still taking part, of the useful time left.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[86-a-recusa-de-um-grupo-inteiro-recalcula-o-tempo-que-falta]`

#### NOTIFICATIONS-ENGINE-SETTINGS-16: A tier with no candidates does not take part in Method B (rule 2)
Given Method B and a tier with no candidates for the type and no invitation out for it, when another
tier sends, then n leaves that tier out and the shares are those of the tiers taking part.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[85-um-grupo-sem-candidatos-nao-conta]`

#### NOTIFICATIONS-ENGINE-SETTINGS-17: A late spot splits only the useful time left before the last invitation (rule 2)
Given Method B and a spot that opens shortly before `last_invite_at`, when its tiers send, then each T is
its share of the useful time from that opening to `last_invite_at`, quiet hours excluded.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[87-vaga-de-ultima-hora-com-pouco-tempo-util]`

#### NOTIFICATIONS-ENGINE-SETTINGS-18: Method B's rounds inside one tier descend by the same parts (rule 2; scenario 84)
Given scenario 84 (Method B, the share of group 3, the first tier taking part, 3 h from 15:30, 9
candidates and a budget of 3, so 3 rounds), when nobody answers, then the rounds go out at 15:30, 16:42 and 17:30 (72 and 48 minutes,
3:2 of two hours) and the next tier at 18:30 (the last third, one hour).
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[84-varias-rondas-dentro-do-primeiro-grupo]`

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

#### NOTIFICATIONS-ENGINE-SETTINGS-19: Each session is planned with its own coach's settings, read at every call (rule 9)
Given two coaches with different settings and a lookup from session to settings, when the engine ticks
and one coach's settings change between two calls, then each session is planned with its coach's
settings, and the changed coach's sessions use the new values from the next call.
test: `backend/padel_app/tests/test_invitation_engine_settings.py` › `test_settings_are_looked_up_per_session_at_every_call`

#### NOTIFICATIONS-ENGINE-SETTINGS-20: hours_before counts real hours, across a clock change (rule 10)
Given `hours_before` 24 and a class the day after the clocks change, when its instant is computed, then
it is 24 real hours before the class's real start, the same instant `_fire_time_utc` gives.
test: `backend/padel_app/tests/test_invitation_engine_settings.py` › `test_hours_before_counts_real_hours_across_a_clock_change`

#### NOTIFICATIONS-ENGINE-SETTINGS-21: days_before is the class's wall date minus N days, at the club's time (rule 10)
Given `days_before_at_time` 1 at 19:00 and a class at 23:30, when its instant is computed, then it is
19:00 Lisbon on the day before the class's wall date, the same instant `_fire_time_utc` gives.
test: `backend/padel_app/tests/test_invitation_engine_settings.py` › `test_days_before_at_time_is_the_wall_date_at_lisbon_time`

#### NOTIFICATIONS-ENGINE-SETTINGS-22: none opens invitations at once and sends no attendance request (rule 10)
Given `first_invite` `none` and `attendance_request` `none`, when a session is created and runs happen
up to its start, then invitations may go from the first run, no attendance request is ever sent,
and with `auto-entry` on a waiting-list member is placed by a spot that opens at any time before the
start.
test: `backend/padel_app/tests/test_invitation_engine_settings.py` › `test_none_starts_invitations_at_creation_and_sends_no_attendance_request`

#### NOTIFICATIONS-ENGINE-SETTINGS-23: With fill_never_held off, only freed spots are invited for (rule 11)
Given capacity 8, 6 regulars of whom one right regular says No (two spots never held, one freed), when
runs plan with `fill_never_held` off, then invitations are sent for the one right spot only, and with
it on for all three.
test: `backend/padel_app/tests/test_invitation_engine_settings.py` › `test_fill_never_held_off_invites_only_for_freed_spots`

#### NOTIFICATIONS-ENGINE-SETTINGS-24: With fill_never_held off, direct join and automatic entry are limited the same way (rule 11)
Given capacity 8, 6 regulars of whom one right regular is absent and one {left, right} regular is absent,
and an invitee who accepted on the right, with `fill_never_held` off, when a student asks to join
directly and automatic entry runs, then only the one `either` spot left free can be taken, and the two
never-held spots are taken by nobody.
test: `backend/padel_app/tests/test_invitation_engine_settings.py` › `test_fill_never_held_off_limits_direct_join_and_automatic_entry`

#### NOTIFICATIONS-ENGINE-SETTINGS-25: Automatic entry places only who its list's tier would invite (rule 3)
Given `auto-entry` on, a spot opening before `attendance_request_at`, and on the students' list a student
the coach excluded, one blocking automatic invitations, one the coach removed in a semi-automatic
request, one postponed by the daily cap and one free, and on the coach's list one blocking all
notifications, when the run places, then only the free students'-list member is placed, and the
coach's-list member is not.
test: `backend/padel_app/tests/test_invitation_engine_auto_entry.py` › `test_auto_entry_places_only_who_the_tier_would_invite`

### Waves
Cross-spec order: `notifications/_overview.md`, "Engine waves".
1. (W1) SETTINGS-3, SETTINGS-4 — `invitation_engine/settings.py` (the timing shape of rule 2, the floor,
   `const:METHOD_B_PART`), with TIMELINE W1's shared-module change.
2. (W7) SETTINGS-1, SETTINGS-2, SETTINGS-5, SETTINGS-15, SETTINGS-16, SETTINGS-17, SETTINGS-11, SETTINGS-12, SETTINGS-13 —
   `invitation_engine/timeline.py` (T per tier, Method B at send), `invitation_engine/planner.py`
   (`side: other`, tier order).
3. (W8) SETTINGS-6, SETTINGS-7, SETTINGS-8 — `invitation_engine/planner.py` (automatic entry, the
   skeleton's owner), `invitation_engine/timeline.py` (the attendance-request boundary),
   `invitation_engine/answers.py` (list joins with a side choice), `const:KIND_ADDED`.
4. (W8) SETTINGS-9, SETTINGS-10 — `invitation_engine/answers.py` (direct join and its refusal).
5. (W8, last) SETTINGS-14 — `adapters/new.py` (a defaults mode: each coach rule on only for scenarios
   that use it).
6. (PAD-911) SETTINGS-4's inner rounds, SETTINGS-18 — `invitation_engine/timeline.py` (the rounds of
   a tier inside its Method B share), `invitation_engine/planner.py` (the tier's rounds at send).
7. (Swap 3, PAD-915) SETTINGS-19 — `invitation_engine/engine.py` (the settings lookup).
8. (Swap 3, PAD-915) SETTINGS-20 to SETTINGS-22 — `invitation_engine/settings.py` (`FirstInvite`,
   `AttendanceRequest` shapes), `invitation_engine/timeline.py` (`first_invite_at`, `attendance_request_at`),
   `invitation_engine/messages.py` (`none`).

### Open questions
- Is an automatically placed student's No also the "said No for this session" gate? — decision (owner
  away): yes for automatic invitations, as for any No; a direct join stays open to them (rule 5),
  because the gate is about invitations.
- `auto-entry` places a student without a Yes, which `notifications.waiting-list` rule 4 (owner,
  2026-10-03) forbids today — decision: a setting, off by default, because the owner's ruling of
  2026-11-11 (brief §2 clause 3) makes the PDF's coach rules settings where the plan is silent.
  **Confirmed by the owner (2026-11-12, waiting-list inspection question 1, "matches Tomás"):**
  waiting-list students are placed directly before the reminder hour as a coach option, and invited
  after it. This supersedes the owner's earlier "keep today's waiting-list behaviour exactly"
  (Codex decision 3), which decision 8 narrowed.
- `direct-join` defaults off in `EngineSettings` though many coaches have `auto_accept_join_requests` on
  today — decision: off is the plan's default; the swap maps each coach's stored value, so no coach's
  behaviour changes at the swap.
- How many rounds a Method B tier has (rule 2; Tomás's answer gives the split, not the count) —
  options: (a) the tier's candidates for the type at its first send over the tier's budget per round
  for the type, rounded up, fixed then; (b) recount at each round as candidates change (D8);
  (c) a coach setting. Decision (owner away, PAD-911): (a), because the share is fixed at the first
  send too, so the split stays the one announced; it gives 84's 3 rounds (9 candidates, a budget of 3).
  This is our inference, not Tomás's words.
- One engine for all coaches or one per coach (swap decision 9) — options: an `Engine` per coach; one
  engine with a settings lookup per session. Decision (coordinator, owner away, PAD-912, 2026-11-11; the owner can reverse it): the lookup in the store's `sessions()` loop
  (rule 9), because one engine keeps one tick and one lock order, and a lookup sees a saved change
  at the next call.
- The clients' timing floor (swap decision 7): today the clients refuse less than 15 minutes
  (`P/config/src/restriction-bounds.ts:23`); the engine's floor is const:ENGINE_T_FLOOR.
  Decision (coordinator, owner away, PAD-912, 2026-11-11; the owner can reverse it): the clients' floor drops to const:ENGINE_T_FLOOR with the new timing controls, because
  one floor must hold on every surface that saves a timing.
- Which settings ship on iOS (swap plan §6.2) — Decision (coordinator, owner away, PAD-912, 2026-11-11; the owner can reverse it): every setting the new engine needs ships on web
  and iOS together, the groups editor (now tiers) included; the other iOS deferrals recorded before
  the swap stand with their reasons. This replaces "A settings screen on web or iOS" under Not this
  spec at the swap, when the screens are specced (`notifications.config`).
- An invitation start of `none` (rule 10), which today never invites for a spot that was never filled —
  decision (coordinator, owner away, PAD-918, 2026-11-12; the owner can reverse it): today's meaning is
  kept through `fill_never_held` off (rule 11); the plan's "one logic for both" holds for every other
  coach.
