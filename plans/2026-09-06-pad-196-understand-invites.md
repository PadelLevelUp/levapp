# PAD-196 — Settings › Tutorials › "Understand invites"

Specs: `.specflow/specs/notifications/invite-simulation.spec.md` (`notifications.invite-simulation`)
and `.specflow/specs/settings/tutorials.spec.md` (`settings.tutorials`), both implementing
`.specflow/specs-business/notifications/coach-understands-who-gets-invited.business.md`.
Decision: `.cortex/atlas/decisions/2026-09-06-invite-simulation-shares-the-engine-pipeline.md`.

Compass rules that bind the tasks below: R-001 (materialize only via `get_or_materialize_instance`),
R-002 (coach-scoped data), R-005 (services layer, thin routes), R-008 (tests inject `now=`),
R-011 (`@/` imports on web), R-012 (HTTP only through `@levelup/api`), R-015 (shadcn primitives),
R-022 (camelCase responses), R-023 (naive UTC in the backend), R-024 (web and iOS ship together).

## Exploration summary

- **Engine pipeline** — `backend/padel_app/services/notification_service.py`:
  `_get_eligible_students_for_group` (L898) and `get_eligible_students` (L975) each run the same
  filter chain (enrolled/active-invite → eligibility bar → excludedPlayers → excludeUnpaidSubscription
  → availability blocker → auto-invite preference → wave criteria) then sort with
  `_build_sort_key(config.get_priority_criteria(), player_stats, vacancy)` (L522).
  `_group_rule_failures` (L654) is the PAD-133 structured evaluator (`{attribute, operation, actual,
  threshold, ladder_distance, reason}`), `short_circuit` flag. `_check_restrictions` (L1087: quiet
  hours, minTimeBeforeClass, maxTotal) and `_check_per_student_daily_limit` take `now=`.
  `_check_waiting_list` (L3486) lazily deactivates expired standing entries — the simulation must
  not. `_create_vacancy_for_absent_player` (L1711) is the side/level snapshot rule.
  `_send_invitation_batch` (L2686) sends `eligible[:batch_size]`, skipping (not backfilling)
  students over the daily quota. `_instance_is_over` (L1599), `_is_semi_auto` (L182).
- **Queue for the approval prompt** — `backend/padel_app/services/replacement_approval_service.py`
  `compute_full_invite_queue` (L89) loops groups/rounds and dedupes. Rewritten onto the shared
  pipeline.
- **Invitation window** — `padel_app.scheduler._compute_invite_start_dt(instance, timing)`.
- **Routes** — `backend/padel_app/modules/notification_engine_api.py`: `_current_coach()` (403 for
  students), `_resolve_instance(model, original_id, date)` materializes through
  `get_or_materialize_instance` (R-001). `eligibility_check` (L104) is the pattern to copy.
  NOTE: `POST /api/app/class_instance` does **not** materialize a virtual occurrence, so the
  simulation endpoints take `{model, originalId, date}` like `eligibility_check`, not an instance id.
- **Backend tests** — `backend/padel_app/tests/test_pad128_eligibility.py` exports `_seed`,
  `_add_student`, `_cp`; `test_frontend_api_authz.py` shows the JWT header pattern
  (`create_access_token(identity=str(user_id))` + `app.config["JWT_SECRET_KEY"]`).
- **Web settings** — `frontend/apps/web/src/pages/SettingsPage.tsx`: `SettingsTab` union +
  `SETTINGS_TABS` registry with `audience`; sections rendered by `activeTab ===` switch; nav test ids
  `settings-nav-<id>` / `settings-mobile-nav-<id>`.
- **Mobile settings** — `frontend/apps/mobile/src/features/settings/settings-sections.ts`
  (`SettingsSectionId`, `COACH_ONLY_SECTIONS`, `SETTINGS_SECTIONS`, `visibleSections`) and
  `frontend/apps/mobile/app/(tabs)/settings.tsx` (`renderSection` switch, row testID
  `settings-nav-<id>`, back button `settings-back`). Sections are plain components using
  `@/components/ui/{card,text,badge,spinner,button}` and `@levelup/api` namespaces.
  `@rn-primitives/select` portals are invisible to Maestro → use `Pressable` rows.
- **API / types / shared** — `frontend/packages/api/src/resources/notificationEngine.ts`
  (web re-exports it from `apps/web/src/api/notificationEngine.ts`);
  `frontend/packages/types/src/domain.ts`; `frontend/packages/config/src/*.ts` with sibling
  `*.test.ts` run by `npm run test:packages` (vitest, `vitest.packages.config.ts`).
- **Locales** — `frontend/src/locales/{pt,en}/<area>.json`, one top-level key per file; web globs
  them (`apps/web/src/i18n.ts`), mobile static-imports each file in
  `apps/mobile/src/lib/i18n.ts` (both `enNamespaces` and `ptNamespaces` arrays).
- **Class data for the picker** — `calendarApi.getCalendarEvents(from, to)` → `CalendarEvent[]`
  (`model`, `originalId`, `date`, `title`, `startTime`, `participantCount`, `status`, `type`);
  `classesApi.getClassInstance(event)` → `participants: Player[]` with `user.name`.
- **E2E** — Playwright specs in `frontend/apps/web/e2e/settings/`, helpers `loginAsCoach`,
  `loginAsStudent`, `openSettings`; seed: coach `e2e-coach` (levels I1 order 1, B1 order 2),
  `e2e-student` (B1/right) enrolled in "E2E Academy Class" (next Monday 10:00, level B1, max 6),
  `e2e-student-2` (B1/left) not enrolled, 27 fillers I1/right, `ghost-player` no level; default
  config (auto on, default invitation groups, maxSimultaneous 3 enabled, maxTotal 10).
  Maestro flows in `frontend/apps/mobile/.maestro/flows/`, login via
  `../subflows/login-coach.yaml`, Settings tab `tab-settings`.

## Gap analysis

**Can reuse:** `_group_rule_failures`, `eligibility_failures`, `effective_eligibility`,
`_build_sort_key`, `_attendance_stats`, `_side_preference_rank`, `ladder_index_map`,
`_check_restrictions`, `_check_per_student_daily_limit`, `_check_waiting_list`,
`_compute_invite_start_dt`, `_resolve_instance`, `_current_coach`, `searchPlayers`,
`getCalendarEvents`, `getClassInstance`, settings registries on both apps, `Badge`/`Card` on both.

**Must create:** `services/invite_simulation_service.py`; `tests/test_pad196_invite_simulation.py`;
types + API functions; `packages/config/src/invite-simulation.ts` (+ test); web
`TutorialsSection.tsx`, `tutorials/UnderstandInvitesTutorial.tsx`; mobile `tutorials-section.tsx`,
`understand-invites-tutorial.tsx`; `locales/{pt,en}/tutorials.json`; Playwright spec; Maestro flow.

**Must modify:** `notification_service.py` (shared stage-tagged pipeline, `dry_run` on
`_check_waiting_list`, snapshot helper), `replacement_approval_service.py`
(`compute_full_invite_queue` → shared pipeline), `notification_engine_api.py` (two routes),
`SettingsPage.tsx`, `settings-sections.ts`, `settings.tsx`, `i18n.ts`, `settings.json` (pt/en nav),
`packages/config/src/index.ts`, spec rule 1/2 wording (instance addressing).

**Assumptions (stated, proceed):**
- The two endpoints address the class as `{model, originalId, date}` (the notify blueprint's
  existing convention), because that is the only path that materializes a virtual occurrence
  (R-001). The spec's rule 1/2 are amended to say so in Task 0.
- `daily_quota` is reported for any candidate currently over quota, whatever their rank.
- `first_batch` is exactly what `_send_invitation_batch` would send now: the first
  `maxSimultaneous` (capped by the remaining `maxTotal` budget) candidates of the first non-empty
  round, minus those over the daily quota (the engine skips without backfilling).
- Explain for an invited player returns their round, rank and sendStatus from the same
  simulation; for a dropped player the first failing stage in the spec's order.

## Size check

Two batches, executed in order, each verified on its own:
- **Batch A — backend** (Tasks 0–8): ~900 lines of touched code + one test module.
- **Batch B — frontend** (Tasks 9–19): types, API, shared formatter, web, mobile, locales, E2E, Maestro.

## Response contract (both batches build to this)

```jsonc
POST /api/app/notify/invite_simulation   { model, originalId, date, departingPlayerId }
{
  "evaluatedAt": "2026-09-06T12:00:00",            // naive UTC ISO
  "approvalRequired": false,
  "gates": [ { "code": "auto_notify_disabled", "blocked": false },
             { "code": "class_notifications_disabled", "blocked": false },
             { "code": "class_over", "blocked": false },
             { "code": "invitation_window", "blocked": true, "opensAt": "…" },
             { "code": "quiet_hours", "blocked": false, "until": "07:00" },
             { "code": "min_time_before_class", "blocked": false, "minutes": 30 },
             { "code": "max_total_reached", "blocked": false, "sent": 0, "limit": 10 } ],
  "waitingListPlacement": null | { "playerId": "12", "name": "Dora", "standing": true },
  "spot": { "side": "left", "levelId": "3", "levelCode": "5", "levelSource": "player" },
  "rounds": [ { "number": 1, "kind": "group", "label": "1",
                "rules": [ { "attribute": "level", "operation": "same_as_vacancy", "value": null } ],
                "candidates": [ { "playerId": "7", "name": "…", "levelCode": "5", "side": "left",
                                  "rank": 1,
                                  "priority": [ { "id": "level", "ladderDistance": 0 },
                                                { "id": "justified_misses", "rate": 0.05 },
                                                { "id": "attendance", "rate": 0.92 } ],
                                  "sendStatus": "first_batch" } ] } ]
}
POST /api/app/notify/invite_simulation/explain  { …same…, playerId }
{ "playerId": "7", "name": "…", "stage": "eligibility" | …,
  "details": { … } }   // invited: {roundNumber, rank, sendStatus}; eligibility: {failures:[…]};
                       // no_round_matched: {rounds:[{number, failures:[…]}]}; others: {}
```

`priority` is an ordered list (the coach's enabled criteria in configured order) rather than an
object, so the client renders it in the same order the engine sorted by.

---

## Batch A — backend

### Task 0: Amend spec addressing, commit spec

**Criterion:** `notifications.invite-simulation` — rules 1–2 (endpoint contract)
**Files:** `.specflow/specs/notifications/invite-simulation.spec.md` (modify)
**Change:** In rule 1 replace `{lessonInstanceId, departingPlayerId}` with
`{model, originalId, date, departingPlayerId}` and add: "`model`/`originalId`/`date` address the
class exactly as `eligibility_check` does and resolve through `get_or_materialize_instance`
(R-001) — the only sanctioned way to reach a virtual occurrence." In rule 2 replace
`{lessonInstanceId, departingPlayerId, playerId}` with `{model, originalId, date,
departingPlayerId, playerId}`. Same wording in the business spec is unaffected.
**Verify:** `cortex validate 2>&1 | grep -c "invite-simulation"` prints `0` (no new errors), then
`git commit -m "spec(PAD-196): simulation endpoints address the class like eligibility_check"`.

### Task 1: Failing backend tests

**Criterion:** every criterion of `notifications.invite-simulation`
**Files:** `backend/padel_app/tests/test_pad196_invite_simulation.py` (create)
**Change:** Import `_seed`, `_add_student`, `_cp` from `test_pad128_eligibility`. Add helpers:
`_enrol(player_id, instance_id)` (Association_PlayerLessonInstance + Presence invited/unconfirmed),
`_config(coach_id, **fields)` (update NotificationConfig columns and commit),
`_simulate(app, ids, departing, now=None)` calling
`invite_simulation_service.simulate_vacancy(instance, coach_id, departing, now=now)`, and
`_explain(...)`. Write one test per spec criterion, named after it:
- `test_matches_engine_unset_bar` — 6 roster students (mixed levels/sides), Alice enrolled at
  level 5/left; run `simulate_vacancy`; create a REAL vacancy with
  `_create_vacancy_for_absent_player(instance, coach_id, alice)` and call
  `trigger_invitations(instance, coach_id, now=now)` with `maxSimultaneous` disabled; assert the set
  of `NotificationEvent.player_id` created equals the set of simulated round-1 candidates and their
  order equals the round-1 ranking; and assert the full ordered player id list across
  `rounds` equals `compute_full_invite_queue(vacancy, …)` ids.
- `test_matches_engine_level_bar` — same with `eligibility_rules=[{level, within_n_of_class, 1}]`
  on a ladder `4,5,5-` and a class at `4`; a `5-` student appears in neither.
- `test_matches_engine_legacy_rounds` — `invitation_groups=None`; queue equal; every round `kind
  == "legacy"`.
- `test_simulation_writes_nothing` — semi-auto mode, an active `StandingWaitingListEntry` with
  `expires_at` in the past fanned to a `WaitingListEntry`; count rows in `vacancies`,
  `notification_events`, `messages`, `replacement_approval_prompts`, `waiting_list_entries`,
  `standing_waiting_list_entries` before/after; standing entry still `is_active`; `credits_used`
  unchanged.
- `test_departing_and_enrolled_never_candidates` — Alice/Bob/Carol enrolled; none in any round;
  explain Alice → `departing_player`; explain Bob → `already_enrolled`.
- `test_quiet_hours_gate_club_wall_clock` — `restrictions.quietHours.enabled=True`; `now` =
  `datetime(2026, 7, 15, 21, 30)` (22:30 WEST) → gate blocked with `until`; rounds present;
  `now = datetime(2026, 7, 15, 6, 30)` (07:30 WEST) → not blocked. Class start must be after both.
- `test_invitation_window_reported_not_applied` — timing `{hours_before: 2}`, class in 6h →
  `invitation_window.blocked` and `opensAt == start - 2h`; rounds present.
- `test_semi_auto_reports_approval_with_prompt_list` — `invitation_mode="semi_automatic"`;
  `approvalRequired` true; ids equal `compute_full_invite_queue` for a real vacancy.
- `test_waiting_list_member_is_placed_not_invited` — bar `[{level, same_as_class}]`, Dora level 5
  with active `WaitingListEntry` linked to a standing entry → `waitingListPlacement.playerId ==
  str(dora)`, `standing is True`, Dora absent from rounds.
- `test_explain_names_eligibility_rule` — ladder 4/5/5-, bar within 1, class at 4, Eve at 5- →
  stage `eligibility`, one failure record with `attribute level`, `operation within_n_of_class`,
  `threshold 1`, `ladder_distance 2`.
- `test_explain_reports_blocker` — Frank with a `CalendarBlock(type="unavailable",
  blocks_auto_invitations=True)` on the class window (see `student_availability_service` for the
  fields) → stage `unavailable`, `details == {}`.
- `test_explain_reports_auto_invites_off` — Gina with `block_auto_invitations=True` on her user
  (field per `student_notification_preferences.player_blocks_auto_invitations`) → `auto_invites_off`.
- `test_explain_reports_position_and_send_status` — `maxSimultaneous` enabled at 2, four round-1
  candidates → third: `invited`, `roundNumber 1`, `rank 3`, `sendStatus queued`; first:
  `first_batch`.
- `test_daily_quota_marks_candidate` — `maxInvitesPerStudentPerDay` enabled at 1; one
  `NotificationEvent` for Hugo today; Hugo otherwise first → `sendStatus daily_quota`, `rank 1`.
- `test_student_caller_gets_403` — Flask test client with a student JWT on both routes → 403.
- `test_routes_happy_path` — coach JWT, body `{model: "LessonInstance", originalId, date,
  departingPlayerId}` → 200 with `rounds`; explain → 200 with `stage`.
**Verify:** `cd backend && source .venv/bin/activate && PYTHONPATH="$PWD" python -m pytest padel_app/tests/test_pad196_invite_simulation.py -q` — every test FAILS (ImportError on the service).

### Task 2: Stage-tagged candidate pipeline in notification_service

**Criterion:** `notifications.invite-simulation` — "The simulation invites exactly who the engine invites" (all three)
**Files:** `backend/padel_app/services/notification_service.py` (modify)
**Change:** Add, near `_get_eligible_students_for_group`:
```python
CANDIDATE_STAGES = ("departing_player", "already_enrolled", "already_invited", "eligibility",
                    "excluded_by_coach", "inactive_account", "unavailable", "auto_invites_off",
                    "no_round_matched", "invited")

@dataclass
class CandidateVerdict:
    cp: Association_CoachPlayer
    stage: str
    details: dict = field(default_factory=dict)

def evaluate_candidates(vacancy, instance, coach_id, config, *, wave, explain=False,
                        only_player_ids=None) -> list[CandidateVerdict]:
```
`wave` is `("group", group_index)` or `("round", round_number)`. Evaluate every
`Association_CoachPlayer` of the coach (or only `only_player_ids`), tagging the FIRST failing
stage in `CANDIDATE_STAGES` order; a player who passes everything is `invited`. Stage sources:
`departing_player` ← `vacancy.original_player_id`; `already_enrolled` ← `instance.players_relations`;
`already_invited` ← NotificationEvent for `vacancy.id` in sent/queued/confirmed, **guarded by
`if vacancy.id is not None`** (an unsaved vacancy has none); `eligibility` ← `effective_eligibility`
+ `passes_eligibility` (when `explain`, `details={"failures": eligibility_failures(...)}`);
`excluded_by_coach` ← `restrictions["excludedPlayers"]`; `inactive_account` ←
`restrictions["excludeUnpaidSubscription"]` and `user.status != "active"`; `unavailable` ←
`student_availability_service.user_is_blocked_for_window(user_id, instance.start_datetime,
instance.end_datetime)`; `auto_invites_off` ← `student_notification_preferences.player_blocks_auto_invitations(player_id)`;
`no_round_matched` ← for `("group", i)`: `_group_rule_failures(rules, cp, vacancy, coach_id,
instance, short_circuit=not explain)`; for `("round", n)`: the existing `same_level` /
`same_side` / `max_unjustified_absences` checks, emitting records `{attribute: "level"|"side"|
"unjustified_absences", operation: "same_level"|"same_side"|"max_unjustified_absences", actual,
threshold}` (fail closed on a level-less vacancy with `reason: "class_has_no_level"`). An unknown
round number yields every player `no_round_matched`. Both wrappers become:
```python
def _get_eligible_students_for_group(vacancy, instance, coach_id, config, group_index):
    return _rank_invited(evaluate_candidates(..., wave=("group", group_index)), config, vacancy)
def get_eligible_students(vacancy, instance, coach_id, config, round_number):
    return _rank_invited(evaluate_candidates(..., wave=("round", round_number)), config, vacancy)
```
where `_rank_invited` builds `player_stats` via `_attendance_stats` for the invited cps and sorts
with `_build_sort_key` — exactly the code the two functions run today. Keep their signatures and
return type (`list[Association_CoachPlayer]`). Also add
`ordered_invite_rounds(vacancy, instance, coach_id, config) -> list[tuple[int, str, list, list]]`
returning `(number, kind, rules, ranked_cps)` per wave in engine order, deduplicated so a player
appears only in the first wave that admits them (groups when `config.get_invitation_groups()` is
non-empty, else legacy rounds; `rules` for a legacy round is the criteria mapped to
`[{attribute, operation, value}]`).
**Verify:** `cd backend && source .venv/bin/activate && PYTHONPATH="$PWD" python -m pytest padel_app/tests/test_pad128_eligibility.py padel_app/tests/test_pad133_eligibility_reasons.py padel_app/tests/test_notification_engine.py -q` (existing engine suites still green — find the engine test files with `ls padel_app/tests | grep -i "notif\|invit\|pad128\|pad133\|semi"` and run all of them).

### Task 3: Vacancy snapshot helper and dry-run waiting list

**Criterion:** `notifications.invite-simulation` — "The simulation writes nothing", "A waiting-list member who passes the bar is placed, not invited"
**Files:** `backend/padel_app/services/notification_service.py` (modify)
**Change:** (a) Extract `vacancy_snapshot_for_player(instance, coach_id, player_id) -> tuple[side,
level_id, level_source]` from `_create_vacancy_for_absent_player` (`level_source` is `"player"`
when `cp.level_id` is set, `"class"` when the fallback `effective_level_id(instance)` is used,
`"none"` otherwise) and make `_create_vacancy_for_absent_player` call it. (b) Add keyword
`dry_run: bool = False` to `_check_waiting_list`; when `dry_run`, an expired/inactive standing
entry is `continue`d WITHOUT calling `_deactivate_standing_entry`. No other behaviour change.
**Verify:** `cd backend && source .venv/bin/activate && PYTHONPATH="$PWD" python -m pytest padel_app/tests -q -k "waiting or vacancy or pad122 or pad123"`.

### Task 4: compute_full_invite_queue on the shared pipeline

**Criterion:** `notifications.invite-simulation` — "Semi-automatic mode reports the approval step with the prompt's list"
**Files:** `backend/padel_app/services/replacement_approval_service.py` (modify)
**Change:** Rewrite `compute_full_invite_queue` to
`for number, _kind, _rules, cps in ordered_invite_rounds(vacancy, instance, coach_id, config):
queue.extend({**_serialize_cp_for_group(cp), "roundNumber": number} for cp in cps)`. Same output
shape as today.
**Verify:** `cd backend && source .venv/bin/activate && PYTHONPATH="$PWD" python -m pytest padel_app/tests -q -k "approval or semi"`.

### Task 5: invite_simulation_service

**Criterion:** `notifications.invite-simulation` — all criteria except the 403 one
**Files:** `backend/padel_app/services/invite_simulation_service.py` (create)
**Change:** Public API:
```python
def simulate_vacancy(instance, coach_id, departing_player_id, *, now=None) -> dict
def explain_player(instance, coach_id, departing_player_id, player_id, *, now=None) -> dict
```
Internals: `_hypothetical_vacancy(instance, coach_id, departing_player_id)` builds
`Vacancy(lesson_instance_id=…, coach_id=…, original_player_id=…, side=…, level_id=…, status="open",
current_round_number=1)` **without** `create()`/`db.session.add` (set `vacancy.lesson_instance =
instance` and `vacancy.level` via `CoachLevel.query.get`); `_gates(instance, config, now)` builds the
seven gate records from `config.auto_notify_enabled`, `instance.notifications_enabled`,
`_instance_is_over(instance, now)`, `_compute_invite_start_dt(instance,
config.get_invitation_start_timing())` (blocked when `now < opensAt`), quiet hours (club-local
hour via `CLUB_TZ` from `padel_app.utils.dates`; `until` = next 07:00 club-local rendered `"07:00"`
plus `untilAt` ISO), `minTimeBeforeClass` (`minutes`, blocked when `(start - now) < minutes`),
`maxTotal` (`sent` = count of sent/queued/confirmed events for the instance, `limit`).
`_waiting_list_placement` calls `_check_waiting_list(vacancy, instance, coach_id, config, 1,
dry_run=True)`. `rounds` from `ordered_invite_rounds`; per candidate compute `rank`, `priority`
(ordered list for the ENABLED `config.get_priority_criteria()` ids: `level` → `ladderDistance` from
`ladder_index_map(coach_id)`; `justified_misses`/`attendance` → `rate` from `_attendance_stats`;
`playing_side` → `match` from `_side_preference_rank` (0→"exact",1→"both",2→"other");
`subscription_status` → `active`), `sendStatus` per the assumptions above using
`restrictions["maxSimultaneous"]`, remaining `maxTotal` budget and
`_check_per_student_daily_limit(player_id, coach_id, restrictions, now=now)`. `spot` from the
snapshot helper (`levelCode` via `CoachLevel`). `evaluatedAt = now.isoformat()`. All ids are
strings (R-022 camelCase keys). `explain_player`: run `simulate_vacancy`; if the player is in a
round return `invited` with `{roundNumber, rank, sendStatus}`; else run `evaluate_candidates(...,
explain=True, only_player_ids=[player_id])` for each wave in order; the stage is the first wave's
stage unless it is `no_round_matched`, in which case `details={"rounds": [{"number", "failures"}]}`
over all waves; `eligibility` → `details={"failures": [...]}`; boolean stages → `{}`.
Nothing in this module calls `create()`, `save()`, `db.session.add` or `commit`.
**Verify:** `cd backend && source .venv/bin/activate && PYTHONPATH="$PWD" python -m pytest padel_app/tests/test_pad196_invite_simulation.py -q -k "not 403 and not routes"`.

### Task 6: Routes

**Criterion:** `notifications.invite-simulation` — "A student caller is refused", routes happy path
**Files:** `backend/padel_app/modules/notification_engine_api.py` (modify)
**Change:** Add `@bp.post("/invite_simulation")` and `@bp.post("/invite_simulation/explain")`,
both `@jwt_required()`, `coach = _current_coach()`, `instance = _resolve_instance(model,
int(originalId), date)`, then 404 unless an `Association_CoachLessonInstance` links
`instance.id` to `coach.id`; 400 unless `departingPlayerId` is in
`{rel.player_id for rel in instance.players_relations}`; explain additionally 404 unless
`Association_CoachPlayer(coach_id, player_id)` exists. Return `jsonify(simulate_vacancy(...))` /
`jsonify(explain_player(...))`. Thin handlers (R-005).
**Verify:** `cd backend && source .venv/bin/activate && PYTHONPATH="$PWD" python -m pytest padel_app/tests/test_pad196_invite_simulation.py -q` — all green.

### Task 7: Backend regression

**Criterion:** `notifications.invite-simulation` rule 4 — "every existing invitation test passes untouched"
**Files:** none
**Verify:** `cd backend && source .venv/bin/activate && PYTHONPATH="$PWD" python -m pytest padel_app/tests/ -q`.

### Task 8: Commit batch A

**Verify:** `git add backend plans .specflow && git commit -m "feat(PAD-196): read-only invite simulation on the engine's own candidate pipeline"`.

---

## Batch B — frontend (web + iOS together, R-024)

### Task 9: Types and API functions

**Criterion:** `settings.tutorials` rule 3 (API through `@levelup/api`)
**Files:** `frontend/packages/types/src/domain.ts` (modify), `frontend/packages/api/src/resources/notificationEngine.ts` (modify)
**Change:** Add types mirroring the response contract: `InviteSimulationGate`,
`InviteSimulationSpot`, `InviteSimulationPriority` (discriminated on `id`),
`InviteSimulationCandidate`, `InviteSimulationRound`, `InviteSimulation`,
`InviteExplainStage` (union of the ten stage strings), `InviteExplain`, `EligibilityFailure`
(`{attribute, operation, actual, threshold, ladder_distance, reason}`), and the request
`InviteSimulationRequest = { model: string; originalId: number | string; date: string;
departingPlayerId: string }`. Add `simulateInvites(req): Promise<InviteSimulation>` →
`POST /app/notify/invite_simulation` and `explainInviteCandidate(req & { playerId }):
Promise<InviteExplain>` → `POST /app/notify/invite_simulation/explain`.
**Verify:** `cd frontend && npx tsc --noEmit -p apps/web/tsconfig.app.json`.

### Task 10: Shared formatter with unit test

**Criterion:** `settings.tutorials` rules 4–6 (structured codes rendered per locale, one renderer for eligibility failures)
**Files:** `frontend/packages/config/src/invite-simulation.ts` (create), `frontend/packages/config/src/invite-simulation.test.ts` (create), `frontend/packages/config/src/index.ts` (modify)
**Change:** Pure functions returning `{ key: string; params?: Record<string, unknown> }` so both
shells call `t(key, params)`: `describeEligibilityFailure(f)` (keys under
`tutorials.eligibility.*`: `levelBelow`/`levelAbove` with `{n}` from `|ladder_distance|`,
`levelNotSame`, `classHasNoLevel`, `studentHasNoLevel`, `levelNotInLadder`, `absencesOver`
`{actual, threshold}`, `attendanceUnder`, `sideMismatch`, `subscription`, `generic`);
`describeGate(g)` (`tutorials.gates.<code>` with `{until, opensAt, minutes, sent, limit}`);
`describeStage(stage)` (`tutorials.stages.<stage>`); `describeRoundRules(rules)` (empty →
`tutorials.rounds.everyone`; else join of `tutorials.rules.<attribute>.<operation>` with `{value}`);
`describeSendStatus(s)`; `describePriority(p)` (`tutorials.priority.<id>` with the value, rates
as percentages). Write the test with the record shapes from the spec ("2 levels below" → key
`levelBelow`, n=2; "over the unjustified-absence limit (4, limit is 2)" → `absencesOver`).
**Verify:** `cd frontend && npx vitest run --config vitest.packages.config.ts packages/config/src/invite-simulation.test.ts`.

### Task 11: Locales

**Criterion:** `settings.tutorials` rule 6
**Files:** `frontend/src/locales/pt/tutorials.json` (create), `frontend/src/locales/en/tutorials.json` (create), `frontend/src/locales/pt/settings.json` (modify: `settings.nav.tutorials` = "Tutoriais"), `frontend/src/locales/en/settings.json` (modify: "Tutorials")
**Change:** Top-level key `tutorials` with: `title`, `description`, `understandInvites.{title,
description, stepClass, stepPlayer, stepResults, noClasses, loading, evaluatedAt, spot
({side, level, source}), approvalRequired, waitingList, rounds.{title, everyone, empty},
lookup.{title, placeholder, noResults}, sendStatus.{first_batch, queued, daily_quota},
invitedPosition}`, `gates.*` (seven codes, with "resume at {{until}}" / "opens at {{opensAt}}"),
`stages.*` (ten), `rules.*`, `eligibility.*`, `priority.*`, `sides.{left,right,both,none}`,
`levelSource.{player,class,none}`. Portuguese first, English mirrored key for key.
**Verify:** `node -e "for (const l of ['pt','en']) JSON.parse(require('fs').readFileSync('frontend/src/locales/'+l+'/tutorials.json','utf8'))"` and
`diff <(node -e "const f=l=>JSON.stringify(Object.keys(require('./frontend/src/locales/'+l+'/tutorials.json').tutorials).sort());console.log(f('pt'))") <(node -e "const f=l=>JSON.stringify(Object.keys(require('./frontend/src/locales/'+l+'/tutorials.json').tutorials).sort());console.log(f('en'))")` prints nothing.

### Task 12: Failing web E2E

**Criterion:** `settings.tutorials` — all seven UI criteria (web half)
**Files:** `frontend/apps/web/e2e/settings/tutorials-understand-invites.spec.ts` (create)
**Change:** Tests named `"US-196-01: coach sees Tutorials after Notifications, student does not"`
(nav `settings-nav-tutorials` visible for coach right after `settings-nav-notifications`; absent
for student), `"US-196-02: picking class then player shows ordered rounds with first-batch
badges"` (open Tutorials → "Understand invites" row (role button) → class button "E2E Academy
Class" → player button "E2E Student" → `getByTestId("tutorial-results")` visible, round-1 list
has candidates numbered 1..N, first three rows carry the first-batch badge text, e2e-student not
listed), `"US-196-03: the lookup explains a student below the bar"` (set the coach's bar via
`POST /api/app/notify/config` with `eligibilityRules: [{attribute:"level",operation:"same_as_class"}]`
in `beforeEach`/restore `null` in `afterEach`; look up "Filler Player 01" (I1, one step above
B1) → verdict text contains the eligibility stage sentence), `"US-196-04: the lookup explains an
invited student's position"` (look up "E2E Student 2" → "round 1, position 1"),
`"US-196-05: switching class clears results"` (create a second class via the API as
`semi-auto-approval.spec.ts` does, pick it → results empty). Use role/text locators (R-013).
**Verify:** `cd frontend/apps/web && npx playwright test e2e/settings/tutorials-understand-invites.spec.ts` — FAILS (no Tutorials nav).

### Task 13: Web Tutorials section + Understand invites

**Criterion:** `settings.tutorials` — web criteria
**Files:** `frontend/apps/web/src/pages/SettingsPage.tsx` (modify), `frontend/apps/web/src/components/settings/TutorialsSection.tsx` (create), `frontend/apps/web/src/components/settings/tutorials/UnderstandInvitesTutorial.tsx` (create)
**Change:** `SettingsPage`: add `"tutorials"` to `SettingsTab`, entry `{ id: "tutorials",
labelKey: "settings.nav.tutorials", icon: <GraduationCap …/>, audience: "coach" }` right after
`notifications`, and `{activeTab === "tutorials" && <TutorialsSection />}`. `TutorialsSection`:
`Card` with the static registry `[{ id: "understand-invites", titleKey, descriptionKey }]` rendered
as `<button role="button" data-testid="tutorial-understand-invites">`; clicking opens
`UnderstandInvitesTutorial` with a back control. `UnderstandInvitesTutorial`: step 1 loads
`getCalendarEvents(today, today+28d)` from `@/api/calendar`, filters `type === "class"`, status not
`canceled`, `(participantCount ?? 0) > 0`, renders buttons `data-testid="tutorial-class-<id>"`
labelled `title · date startTime`; step 2 `getClassInstance(event)` → participant buttons
`tutorial-player-<id>`; step 3 `simulateInvites` → `div data-testid="tutorial-results"` rendering,
in order: gates (blocked first, `Alert` destructive), approval note, waiting-list line, spot line,
rounds (each `Card`, header from `describeRoundRules`, rows `tutorial-candidate-<playerId>` with
rank, name, level `Badge`, side, priority chips, send-status `Badge` variant by status; empty →
`rounds.empty`), header "as of HH:MM" from `evaluatedAt` (`Intl.DateTimeFormat` with
`timeZone: "Europe/Lisbon"`); lookup: `Input` placeholder `lookup.placeholder` → `searchPlayers`
dropdown → `explainInviteCandidate` → `p data-testid="tutorial-verdict"` with the stage sentence
and, for `eligibility`, one line per `describeEligibilityFailure`. Changing class resets player +
results; changing player re-runs; keep a request counter so a stale response is dropped. No
send/approve/exclude buttons (rule 9). shadcn only (R-015), `@/` imports (R-011).
**Verify:** `cd frontend && npx tsc --noEmit -p apps/web/tsconfig.app.json && cd apps/web && npx playwright test e2e/settings/tutorials-understand-invites.spec.ts`.

### Task 14: Mobile registry, section and tutorial

**Criterion:** `settings.tutorials` — "Coach sees Tutorials, student does not — iOS", and the flow criteria on iOS
**Files:** `frontend/apps/mobile/src/features/settings/settings-sections.ts` (modify), `frontend/apps/mobile/app/(tabs)/settings.tsx` (modify), `frontend/apps/mobile/src/features/settings/tutorials-section.tsx` (create), `frontend/apps/mobile/src/features/settings/understand-invites-tutorial.tsx` (create)
**Change:** Add `"tutorials"` to `SettingsSectionId`, to `COACH_ONLY_SECTIONS`, and to
`SETTINGS_SECTIONS` after `notifications` (`labelKey: "settings.nav.tutorials"`, `descriptionKey:
"tutorials.description"`, icon `"school-outline"`). `settings.tsx`: `case "tutorials": return
<TutorialsSection />`. `TutorialsSection`: `Card` listing `Pressable` rows
(`testID="tutorial-understand-invites"`) that open `UnderstandInvitesTutorial` in place with a
back `Pressable` (`testID="tutorial-back"`). `UnderstandInvitesTutorial`: same three steps with
`useQuery` on `calendarApi.getCalendarEvents`, `classesApi.getClassInstance`,
`notificationEngineApi.simulateInvites`; pickers are `Pressable` rows with
`testID="tutorial-class-<id>"` / `tutorial-player-<id>`; results `View testID="tutorial-results"`
with `Badge` variants (`success` first batch, `secondary` queued, `warning` daily quota); lookup
via `Input` + `notificationEngineApi.searchPlayers` list + `explainInviteCandidate`, verdict
`Text testID="tutorial-verdict"`. Same formatter functions from `@levelup/config`.
**Verify:** `cd frontend/apps/mobile && npx tsc --noEmit`.

### Task 15: Mobile i18n static imports

**Criterion:** `settings.tutorials` rule 6 (static-import trap)
**Files:** `frontend/apps/mobile/src/lib/i18n.ts` (modify)
**Change:** Add `import tutorialsEn from "../../../../src/locales/en/tutorials.json"` and the `pt`
twin, and append `tutorialsEn` / `tutorialsPt` to `enNamespaces` / `ptNamespaces`.
**Verify:** `cd frontend/apps/mobile && npx tsc --noEmit && node -e "const s=require('fs').readFileSync('src/lib/i18n.ts','utf8'); if(!/tutorialsPt,/.test(s)||!/tutorialsEn,/.test(s)) process.exit(1)"`.

### Task 16: Maestro flow

**Criterion:** `settings.tutorials` — "Coach sees Tutorials, student does not — iOS", "Picking a class then a player shows the ordered rounds" (iOS)
**Files:** `frontend/apps/mobile/.maestro/flows/19-tutorials-understand-invites.yaml` (create)
**Change:** `runFlow ../subflows/login-coach.yaml` → `tapOn id: tab-settings` → `extendedWaitUntil
visible id: screen-settings` → `scrollUntilVisible id: settings-nav-tutorials` → tap → tap
`tutorial-understand-invites` → `tapOn text: "E2E Academy Class"` (or `id` prefix match
`tutorial-class-`) → `tapOn text: "E2E Student"` → `extendedWaitUntil visible id:
tutorial-results` → `assertVisible id: tutorial-candidate-*` is not supported, so assert the
first-batch badge text (English seed locale). Read-only; no state to restore.
**Verify:** file parses: `cd frontend/apps/mobile && node -e "require('js-yaml')"` is not available — verify with `python3 -c "import yaml,sys; list(yaml.safe_load_all(open('.maestro/flows/19-tutorials-understand-invites.yaml')))"`. Running it needs the simulator (`bash scripts/e2e.sh`), recorded in the PR as run or not run.

### Task 17: Frontend unit + typecheck + E2E regression

**Verify:** `cd frontend && npm test && npx tsc --noEmit -p apps/web/tsconfig.app.json && (cd apps/mobile && npx tsc --noEmit)`; then
`kill $(lsof -ti :5001) 2>/dev/null; kill $(lsof -ti :8080) 2>/dev/null; cd frontend/apps/web && bash e2e/scripts/reset-test-db.sh && npx playwright test`.

### Task 18: Spec status and commit batch B

**Change:** Set `status: implemented` on both leaves and the business spec (Policy A) after
Task 17 is green; update `_overview.md` status lines and `_index.md` table notes.
**Verify:** `cortex validate 2>&1 | grep Conformant` (pre-existing archive errors on staging are
allowed; no new ones), then `git add -A frontend .specflow && git commit -m "feat(PAD-196): Tutorials › Understand invites on web and iOS"`.

### Task 19: Browser walk and PR

Follow the orchestrator's Step 9 (serve locally, walk Settings → Tutorials → Understand invites →
pick class → pick player → lookup) and Step 10 (PR into `staging`).
