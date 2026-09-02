# LevelUp Backend — Attendance/Presence Domain Map

Repo root: `/Users/pedropacheco1/Documents/Projetos/padel_app/levelup/levelup_backend`

## Headline finding

This is **not a greenfield gap** — the backend already has a mature, PAD-numbered attendance/invitation/vacancy subsystem built up over many tickets (PAD-36, 43, 69, 71, 72, 73, 85, 92, 103, 114, 115, 116, 128…). A "validate a past class + record per-player presence + show presence statistics" feature is ~90% already shipped: `Presence` model, `/class_instance/presences/confirm` endpoint, `/attendance_history` endpoint with bucketed charts, dashboard KPIs. The real gaps are narrower than the ticket brief implies (see §6).

---

## 1. Domain models

All in `padel_app/models/`, `db.Model, model.Model` base (gives `created_at`/`updated_at`, `create()/save()/delete()`, `update_with_dict()`).

### `Lesson` — `padel_app/models/lessons.py:9` — table `lessons`
Recurring class **template**.
- `id` Integer PK
- `title` String(255) NOT NULL
- `description` Text nullable
- `start_datetime`, `end_datetime` DateTime NOT NULL (defines default time-of-day)
- `is_recurring` Boolean NOT NULL default False
- `recurrence_rule` Text nullable (JSON-encoded, parsed in `serialize_lesson`)
- `recurrence_end` Date nullable
- `recurs_until_season_end` Boolean NOT NULL default False, server_default "0"
- `type` Enum(`academy`, `private`) NOT NULL — no name given to the Enum (`lesson_type` — actually named, see line 31: `Enum("academy","private", name="lesson_type")`)
- `default_level_id` FK → `coach_levels.id`, relationship `level` → `CoachLevel`
- `max_players` Integer NOT NULL
- `color` String(10) nullable
- `status` Enum(`active`, `ended`, name=`lesson_status`) default `active`
- `notifications_enabled` Boolean NOT NULL default True, server_default "1"
- `club_id` FK → `clubs.id` ondelete CASCADE, NOT NULL, relationship `club`
- Relationships: `coaches_relations` (→ `Association_CoachLesson`, cascade all/delete-orphan), `players_relations` (→ `Association_PlayerLesson`, cascade), `instances` (→ `LessonInstance`, cascade — one-to-many, template owns its materialized occurrences)
- Properties: `coaches`, `players`, `name` (=`title`)

### `LessonInstance` — `padel_app/models/lesson_instances.py:10` — table `lesson_instances`
A materialized **occurrence** of a `Lesson` on a specific date (only exists once someone interacts with that date — presence recorded, edited, etc. — see `get_or_materialize_instance`).
- `id` PK
- `lesson_id` FK → `lessons.id` ondelete CASCADE, NOT NULL
- `original_lesson_occurence_date` Date — **canonical occurrence key**, used to dedupe materialization (see §3)
- `start_datetime`, `end_datetime` DateTime NOT NULL
- `overwrite_title` String(255) nullable
- `level_id` FK → `coach_levels.id`
- `notifications_enabled` Boolean NOT NULL default True, server_default "1"
- `status` **Enum(`scheduled`, `canceled`, `rescheduled`, `completed`, name=`lesson_instance_status`)**, default `scheduled`, NOT NULL — `completed` already exists as a status value, but nothing in the route layer currently sets it (see gap §6)
- `notes` Text nullable
- `max_players` Integer NOT NULL
- `overridden_fields` Text (JSON list, per-instance field overrides vs. the template)
- Relationships: `presences` (→ `Presence`, cascade all/delete-orphan), `players_relations` (→ `Association_PlayerLessonInstance`, cascade), `coaches_relations` (→ `Association_CoachLessonInstance`, cascade)
- Computed properties (no columns): `title`, `players`, **`effective_filled_spots`** (enrolled minus `Presence.status=="absent"`, floored at 0 — the single source of truth for capacity), **`confirmed_spots`** (count of `Presence.status=="present"`)

### `Presence` — `padel_app/models/presences.py:10` — table `presences`
**This is the attendance/presence record table.** One row per (player, lesson_instance).
- `id` PK
- `lesson_instance_id` FK → `lesson_instances.id` ondelete CASCADE, NOT NULL
- `player_id` FK → `players.id` ondelete CASCADE, NOT NULL
- `status` **Enum(`present`, `absent`, name=`lesson_presence_status`)**, nullable — `NULL` = not yet answered
- `justification` **Enum(`justified`, `unjustified`, name=`lesson_presence_justification`)**, nullable
- `invited` Boolean, default False — reminder/invitation-flow flag ("was this player asked to confirm")
- `confirmed` Boolean, default False — reminder-flow flag ("did the player answer the invite"), distinct from `status`
- `validated` Boolean, default False — **set True only when a coach explicitly records attendance** via `add_presences` (i.e. this is the per-row "validated" flag; there is no per-*instance* validated flag today, see §6)
- `late_cancellation` Boolean, NOT NULL, default False, server_default "false" (PAD-43: cancelled at/after the coach's deadline but before start)
- `UniqueConstraint(player_id, lesson_instance_id, name="uq_presence_player_lesson_instance")` — one presence row per player per instance
- Relationships: `player` → `Player.presences`, `lesson_instance` → `LessonInstance.presences`
- **No date column of its own** — every timestamp for reporting comes from the joined `LessonInstance.start_datetime` (documented explicitly in `attendance_history_service.py:9`)

Note the naming: `status`=present/absent is attendance outcome; `confirmed`/`invited` are the RSVP/reminder pipeline; `validated` is "coach has finalized this row." These three axes are orthogonal and easy to conflate when importing a reference feature.

### Association / junction models relevant here
- **`Association_PlayerLesson`** (`Association_PlayerLesson.py:9`, table `player_in_lesson`) — enrollment in the recurring template. `id`, `player_id` FK, `lesson_id` FK, `UniqueConstraint(player_id, lesson_id)`.
- **`Association_PlayerLessonInstance`** (`Association_PlayerLessonInstance.py:9`, table `player_in_lesson_instance`) — enrollment in one materialized occurrence (this is the roster a `Presence` row is checked against). `id`, `player_id` FK, `lesson_instance_id` FK, `UniqueConstraint(player_id, lesson_instance_id)`.
- **`Association_CoachLesson`**, **`Association_CoachLessonInstance`** — coach ownership links (used by `coach_owns_lesson`/`coach_owns_instance`).
- **`Association_CoachPlayer`** (`Association_CoachPlayer.py:9`, table `coach_in_player`) — the coach↔student roster relationship, carrying `level_id` FK → `CoachLevel`, `side` Enum(`left`,`right`,`both`, name=`player_side`), `notes` String(255). Has `notes_list` (→ `CoachPlayerNote`) and `evaluations` (→ `EvaluationEntry`). This is where a player's **level** and **side** live — both feed into eligibility/vacancy matching, not into presence directly.

### `Player` — `padel_app/models/players.py:9` — table `players`
- `id` PK, `user_id` FK → `users.id`
- `presences` relationship → `Presence` (cascade all/delete-orphan) — **direct access point for "this player's presence history"**
- `lesson_instances_relations` → `Association_PlayerLessonInstance`
- `level_history` → `PlayerLevelHistory`, ordered by `assigned_at` desc; `level` property = most recent entry
- `coach_player_info(coach_id)` — the per-relationship dict served to the frontend for a roster row (level, notes, side, active/validated flags)

### `Coach` — `padel_app/models/coaches.py:8` — table `coaches`
- `id`, `user_id` FK
- `clubs_relations`, `evaluation_categories`, `seasons` (all cascade)
- `current_club` property = last club

### `Season` — `padel_app/models/seasons.py:9` — table `seasons`
- `coach_id` FK NOT NULL, `name` String(120) NOT NULL, `start_date`/`end_date` Date NOT NULL
- Purely a coach-scoped date range used by `recurs_until_season_end` on `Lesson` (see `season_service.py`); **no relationship at all to `Presence` or attendance stats** — "season" is not currently a dimension you can slice attendance by without deriving it from dates.

### `CoachLevel` — `padel_app/models/coach_levels.py:9` — table `coach_levels`
- `coach_id` FK NOT NULL, `label` String(100), `code` String(10), `display_order` Integer
- Referenced by `Lesson.default_level_id`, `LessonInstance.level_id`, `Association_CoachPlayer.level_id`. No direct link to `Presence`.

### `Vacancy` — `padel_app/models/vacancy.py:10` — table `vacancies`
Not attendance per se, but tightly coupled: created when a player's `Presence.status` flips to `absent` before class start (`_ensure_vacancy_for_player`, called from the `/class_instance/presences/confirm` route). Columns: `lesson_instance_id` FK NOT NULL, `coach_id` FK NOT NULL, `original_player_id` FK nullable (SET NULL), `side` Enum(`left`,`right`,`both`, name=`vacancy_side`), `level_id` FK nullable, `status` Enum(`open`,`filled`,`expired`, name=`vacancy_status`) default `open`, `approval_status` Enum(`not_required`,`pending`,`approved`,`dismissed`, name=`vacancy_approval_status`) default `not_required`, `invite_not_before` DateTime, `current_round_number`/`current_batch_number` Integer, `filled_by_player_id` FK nullable, `last_activity_at`, `created_at`, `filled_at`. This is the invitation-engine's replacement-matching state, out of scope for a pure presence-stats import but worth knowing it exists so a new "Presences" feature doesn't collide with it.

### Not attendance-related but adjacent (found, not detailed): `player_level_history.py`, `coach_player_note.py`, `evaluation_category.py`, `evaluation_entry.py`, `standing_waiting_list_entry.py`, `waiting_list_entry.py`, `notification_config.py` (carries `eligibility_rules` JSON — PAD-128), `notification_event.py` (invitation log, drives dashboard "pending confirmations").

### Eligibility (PAD-128, recent, 2026-08-08)
`notification_configs.eligibility_rules` — nullable JSON, no server default, deliberately left NULL on existing rows (migration `d5e6f7a8b9c0`, see §5). This is the coach's *bar to invite* a player into a vacancy — separate from attendance recording. Per the memory `[[eligibility-domain-specced]]`, `invitation_groups` are rounds/ordering, not priority, and eligibility rules gate invites on level + absences (no payments). This is the piece of the domain most likely to define what "presence statistics" need to feed — an absence-rate signal for eligibility gating almost certainly wants to read `Presence` rows.

---

## 2. API surface (all in `padel_app/modules/frontend_api.py`, blueprint `bp`, JWT via `flask_jwt_extended`)

All routes below require `@jwt_required()` unless noted.

| Method | Path | Auth pattern | Notes | file:line |
|---|---|---|---|---|
| GET | `/calendar` | `current_coach()`/`current_player()` branch | Returns lesson events (virtual + materialized) + calendar blocks for the range | `frontend_api.py:431` |
| GET | `/lesson_instance/<int:instance_id>` | student sees only own presence | Returns `{lessonInstance, presences}` | `frontend_api.py:463` |
| GET | `/lesson_instances` | `require_coach()` implicit (aborts 403 if `current_coach()` falsy) | Coach-only range query, returns serialized lesson events | `frontend_api.py:697` |
| GET | `/lesson_instance/<int:instance_id>/presences` | student filtered to own `player_id` | Standalone presences-only fetch for one instance | `frontend_api.py:716` |
| GET | `/calendar_event` | ownership/roster check per model type (`lesson`/`lesson_instance`/`calendar_block`) | Generic single calendar-event fetch by `model` + `original_id` query params | `frontend_api.py:730` |
| POST | `/class_instance` | student sees own view only (`viewer_player_id`) | Body: `{model, id, date?}`. Returns full class-instance detail (participants, presences, invitations, training plan) via `serialize_class_instance` | `frontend_api.py:777` |
| GET | `/player_profile/<int:player_id>` | `require_coach()` | Player detail for coach's roster | `frontend_api.py:825` |
| GET | `/attendance_history` | `_resolve_attendance_subject` (self, or coach-of-roster) | Query: `playerId?`, `from?`, `to?`, `granularity?`. Returns bucketed chart data + session list — **this is the existing "presence statistics over time" endpoint** | `frontend_api.py:877` |
| **POST** | **`/class_instance/presences/confirm`** | `@jwt_required()`, coach implied by downstream services | Body: `{classInstance: {...}, presences: [{playerId, status, justification}, ...]}`. **This is the "mark attendance / validate a class" endpoint.** Materializes the instance if needed, writes `Presence` rows, and — if any player is marked `absent` on a future class — kicks off the vacancy/invitation flow (semi-auto approval bundle or immediate invites) | `frontend_api.py:1265` |
| POST | `/add_class` | coach | Create a `Lesson` (recurring template) | `frontend_api.py:967` |
| POST | `/edit_class` | coach, ownership-checked | Edit lesson/instance, handles single-occurrence vs. future-onward scope | `frontend_api.py:1346` |
| POST | `/remove_class` | coach, ownership-checked | Delete lesson/instance with scope | `frontend_api.py:1355` |
| POST | `/class_instance/training/confirm` | `require_coach()` + `require_owned_training_target` | Sets the planned-exercise list for a class instance (not presence, but adjacent — same "manage a class occurrence" surface) | `frontend_api.py:1863` |
| POST | `/dashboard/pending-confirmations/notify` | coach | Manually nudges every student still pending RSVP for tomorrow's classes | `frontend_api.py:1895` |
| GET | `/dashboard` | any authenticated user | Aggregated KPI payload incl. `pending_validations` (unvalidated `Presence` rows) for coaches, `lessons_attended`/`lessons_missed` for players | `frontend_api.py:504` |
| GET | `/coach_players`, `/coach_players_paginated` | coach | Roster listing (level, side, notes) | `frontend_api.py:629`, `637` |
| GET | `/coach_levels`, `/seasons` | coach | Reference data lists | `frontend_api.py:668`, `675` |

### Bulk / import endpoints
- `POST /import/analyze`, `/import/confirm`, `/import/confirm/stream`, `GET /import/history`, `POST /import/<id>/revert` — CSV bulk-import pipeline (`services/import_service.py`, `models/bulk_import.py`). Its table registry (`frontend_api.py:1559`) explicitly lists `("Presences", bulk_create_presences, False)` — **there is already a bulk-presence-creation path used by the CSV importer**, at `padel_app/seed/mock_data.py` or `services/import_service.py` (need to check `bulk_create_presences`'s import source — it's imported at `frontend_api.py:119`, likely from `import_service.py`).

### Explicitly removed routes (documented in comments, useful to know what NOT to re-add)
- `POST /club`, `/user`, `/player`, `/coach`, `/coach_level`, `/lesson`, `/calendar_block` — unauthenticated create wrappers, removed PAD-92.
- `POST /lesson/<id>`, `/calendar_block/<id>` — unauthenticated edit wrappers, removed PAD-92.
- `POST /lesson/<id>/status` — comment at `frontend_api.py:1324` says this was "an unauthenticated status mutation" and was removed; **this appears to be the only place that would have called `update_lesson_status_service` for setting `status="completed"`**, meaning that function is presently dead code with no route (see §6).

No standalone "stats/aggregation" endpoint beyond `/attendance_history` and the dashboard KPIs — there is no `/presence_stats`, `/attendance_summary`, or coach-facing "attendance rate across the roster" endpoint.

---

## 3. Services / business logic

### Recurring → occurrence materialization
`get_or_materialize_instance(lesson, date)` — `padel_app/services/lesson_service.py:102`
- Looks up an existing `LessonInstance` by `original_lesson_occurence_date == date` (falling back to a same-day `start_datetime` match for legacy rows with the column unset).
- If none exists, creates one via `create_lesson_instance_helper`, flushes it, then **creates a `Presence` row for every player enrolled on the parent `Lesson`** with `invited=True, confirmed=False, validated=False` (lines 142–149) — so presence rows exist from the moment an occurrence materializes, before any coach action.
- Schedules reminder/invitation-start jobs via `padel_app.scheduler._maybe_schedule_instance`.
- Fans out standing-waiting-list entries inside a SAVEPOINT so a failure there can't poison the main transaction.

### Recording attendance
`add_presences(lesson_instance, payload)` — `lesson_service.py:315`
- For each `{playerId, status, justification}` item: finds or creates the `Presence` row, runs it through the model's form layer (`get_edit_form`/`get_create_form` + `JsonRequestAdapter`), **deliberately excludes** `invited`/`confirmed`/`late_cancellation` from the writable set so a coach's attendance submit can never clobber the reminder-flow state, and forces `validated = True`.
- `confirm_presences_service(class_instance_data, presences_data)` — `lesson_service.py:617` — resolves whether the incoming id is a materialized `LessonInstance` or a virtual `Lesson` occurrence (via the `id` prefix `lessoninstance-`/`lesson-`, with a `parentClassId` fallback for legacy payloads), materializes if needed, then calls `add_presences`. This is the function behind `POST /class_instance/presences/confirm`.
- After presences are recorded, the route (`frontend_api.py:1265`) checks for new `absent` statuses and — only for **future** instances (`start_datetime > now`) — either bundles a semi-auto approval prompt or immediately triggers replacement invitations via `notification_service.trigger_invitations`. **For past classes this branch is a no-op** (start_datetime is in the past), so "validating a past class" already safely skips the vacancy/invite machinery — good news for an import.

### Instance status ("completed"/"canceled")
`update_lesson_status_service(lesson_id, data)` — `lesson_service.py:665` — materializes the instance for a date and sets `.status` to `data["status"]` (comment says `canceled | completed`), cancels scheduler jobs if canceled. **No route currently calls this function** (confirmed via repo-wide grep — the only route that referenced lesson status mutation, `POST /lesson/<id>/status`, was removed under PAD-92 and never replaced). `notification_service.py` reads `instance.status in ("canceled", "completed")` in several gating checks (lines ~1337, 1534, 2717, 3565) to stop sending reminders/invites once a class is over — so the enum value and its downstream effects exist, but nothing in the current API can put an instance into `completed` state. **This is the clearest concrete gap for a "validate a past class" feature** (see §6).

### Attendance statistics
`build_attendance_history(...)` — `padel_app/services/attendance_history_service.py:118` (full file read; see §5 docstring). Key behavior:
- Pulls `LessonInstance` rows joined to `Presence` filtered on `status == "present"` within a date range for one player.
- Auto-picks bucket granularity (`day` ≤31d span, `month` ≤~18mo, else `year`) via `pick_granularity`, or accepts an explicit pin.
- Gap-fills empty buckets (continuous x-axis, capped at 2000 buckets as a safety valve).
- Returns `{playerId, from, to, granularity, total, buckets: [{start, count}], sessions: [{lessonInstanceId, calendarEventId, title, startDatetime, date, color, href}]}`.
- **Only covers "attended" (present) — no absence/justification breakdown, no roster-wide aggregate, no per-class attendance-rate.** It's a single-player, present-only chart, not general presence statistics.

`compute_player_kpis` / `compute_coach_kpis` — `padel_app/helpers/dashboard/kpis.py:26` and `:77`
- Player: `lessons_attended` (count `Presence.status=="present"`), `lessons_missed` (count `status=="absent"`), `upcoming_lessons` (confirmed + future), `invites_to_confirm` (invited, not confirmed, future).
- Coach: `total_players`, **`pending_validations`** (count of `Presence.validated == False` across the coach's lessons — this is effectively "how many attendance rows still need the coach to mark them"), `monthly_revenue` (hardcoded 0 — not implemented), `scheduled_count` (passed in by caller).

### Absence → vacancy → invitation pipeline (out of scope for pure presence stats, but shares the `Presence.status` field)
`notification_service.py` (very large file, only skimmed) owns `_ensure_vacancy_for_player`, `_is_semi_auto`, `trigger_invitations`, `create_approval_prompts`, `send_manual_notifications`, `proactive_decline_deadline`/`proactive_decline_window_is_open`, and reads `instance.status in ("canceled","completed")` as a kill-switch for further notification activity.

### Scheduler
`padel_app/scheduler.py` — APScheduler-based; `_maybe_schedule_instance(instance)` schedules reminder + invitation-start jobs when an instance materializes; `_compute_invite_start_dt` computes when the invitation window opens; `_maybe_cancel_instance(id)` tears down jobs on cancellation. Not read in full — flagged for a deeper pass if the new feature needs to hook scheduled validation reminders (e.g. "nudge coach to validate yesterday's class").

### No existing: credits, make-ups, capacity waitlist beyond `Vacancy`/`WaitingListEntry`
`standing_waiting_list_entry.py` and `waiting_list_entry.py` exist (found in file listing, not read in depth) and are wired into `get_or_materialize_instance`'s "fan out standing waiting list entries" step — worth a follow-up read if the new feature touches capacity, but they are about filling open spots, not about presence/credit bookkeeping. No credit-ledger or make-up-class model exists anywhere in `padel_app/models/`.

---

## 4. Serializers

- `serialize_presence(presence)` — `padel_app/serializers/presence.py:1` — flat dict: `id, lessonInstanceId, playerId, status, justification, invited, confirmed, validated, lateCancellation`. This is the wire shape for a single presence row everywhere in the API.
- `serialize_lesson_instance(instance)` — `padel_app/serializers/lesson.py:89` — instance-level fields only (id, lessonId, date, startTime, endTime, status, notes, overriddenFields, name, color, maxPlayers). Does **not** embed presences — callers fetch those separately (`GET /lesson_instance/<id>/presences` or the `presences` key on `/class_instance`'s response).
- `serialize_class_instance(obj, viewer_player_id=None)` — `padel_app/serializers/lesson.py:110` — the richest payload: participants, presences (role-filtered — students only see their own row), deduped invitation log (`dedupe_invitation_events`, PAD-72), planned exercises, cancellation-deadline math, proactive-decline window. This is what `/class_instance` and (indirectly) `/class_instance/presences/confirm`'s callers rely on for the "class detail" screen.
- `serialize_lesson(lesson)` — template-level fields (recurrence rule parsed from JSON, no player/presence data).

No dedicated "attendance stats" serializer beyond the plain dicts built inline in `attendance_history_service.build_attendance_history` and the `kpis.py` dataclasses (`CoachKpis`, `PlayerKpis`) which are converted to dicts at the dashboard-payload layer (`helpers/dashboard_services.py`, not read in depth).

---

## 5. Migrations

- Directory: `migrations/versions/`, Alembic via `flask db upgrade` / `flask db migrate`.
- **Current head (confirmed via `flask db heads`): `d5e6f7a8b9c0_pad128_eligibility_rules.py`** (down_revision `c4d5e6f7a8b9`), dated 2026-08-08. 45 migration files total in the linear history reconstructed from `revision`/`down_revision` (one merge point exists earlier: `e1f2a3b4c5d6_merge_pad8_pad43_heads.py`).
- Naming convention: `<12-char-hex-revision-id>_<snake_case_description>.py`, e.g. `d5e6f7a8b9c0_pad128_eligibility_rules.py`. Tickets that touch the schema tend to name the file after the PAD number.
- Style example (`d5e6f7a8b9c0`): docstring explains the *why* (nullable, no server_default, deliberately not backfilled) referencing the spec rule it implements — worth matching that documentation density for a new presence-stats migration.
- Per `MODELS.md` (`padel_app/models/MODELS.md:439`), Alembic does **not** auto-create named Postgres Enum types — any new Enum column needs an explicit `sa.Enum(...).create(op.get_bind(), checkfirst=True)` in `upgrade()` and a matching `.drop(...)` in `downgrade()`.

---

## 6. Gaps — what's missing for "validate a past class + record per-player presence + show presence statistics over time"

Given how much already exists, the gaps are precise, not architectural:

1. **No "class validated" concept at the instance level.** `LessonInstance.status` already has a `completed` enum value and downstream code (`notification_service.py`) already treats `completed`/`canceled` instances as "notification-dead", but **no route sets `status="completed"`** — `update_lesson_status_service` (`lesson_service.py:665`) is unreachable dead code (its only caller route, `POST /lesson/<id>/status`, was removed in PAD-92 and never replaced). Today "validating" a class is implicit/per-row: a `Presence.validated` boolean per player, aggregated ad hoc into the coach dashboard's `pending_validations` KPI. If the new feature wants an explicit "mark this whole class as validated" action, you need either (a) a route that flips `LessonInstance.status → "completed"` (resurrecting `update_lesson_status_service` behind an owned-class check like `require_owned_class`), or (b) a derived "isValidated" computed from `all(p.validated for p in instance.presences)`, or (c) both — status for lifecycle, per-presence validated for row-level finality. This needs an explicit design decision, not a code gap that can be silently filled.

2. **No roster-wide / multi-class presence statistics.** `attendance_history_service.build_attendance_history` is single-player, present-only, and doesn't return absence counts, justified-vs-unjustified breakdowns, or an attendance-rate percentage. `compute_coach_kpis`/`compute_player_kpis` give point-in-time counts, not a time series. A "show presence statistics over time" feature that needs e.g. a coach-facing view across the whole roster, or an absence-rate trend, has no endpoint or service function to build on — `build_attendance_history` would need generalizing (accept a coach_id + optional player filter, and stop hard-filtering to `status=="present"`) or a sibling service written alongside it.

3. **No endpoint to bulk-mark/validate an entire roster's presence in one shot beyond the existing `/class_instance/presences/confirm`.** That endpoint already accepts an array of `{playerId, status, justification}` and is genuinely bulk (§3), so this may already satisfy "record per-player presence" — flag it as *not* a gap, but note it's coupled to the vacancy/invitation side-effects for future classes (harmless no-op for past classes, confirmed by the `start_datetime > now` guard at `frontend_api.py:1286`).

4. **No absence-justification statistics or reporting.** `Presence.justification` (`justified`/`unjustified`) is captured and writable via `add_presences`, but nothing reads it anywhere in `attendance_history_service.py` or `kpis.py` — it's stored, not surfaced. If "presence statistics" is meant to include justified-vs-unjustified breakdowns (plausible for eligibility per `[[eligibility-domain-specced]]`'s "level+absences only" bar), that aggregation doesn't exist yet.

5. **No season-scoped attendance reporting.** `Season` (§1) has no relationship to `Presence`/`LessonInstance` at all — a season is purely a coach-level date range consumed by lesson recurrence (`recurs_until_season_end`). "Attendance for this season" would have to be computed by joining on `LessonInstance.start_datetime BETWEEN season.start_date AND season.end_date`, with no existing helper to do so.

6. **No credit / make-up-class model.** Confirmed no such model exists anywhere in `padel_app/models/`. If the reference app's "Presences" feature includes credits or make-ups, that's a net-new domain, not an extension.

7. **`bulk_create_presences`** is referenced by the CSV-import table registry (`frontend_api.py:1559`, `("Presences", bulk_create_presences, False)`) but its implementation wasn't read in this pass — worth checking `services/import_service.py` before assuming import-time presence creation needs to be built from scratch; it may already exist for the bulk-import path specifically (as opposed to the coach-driven UI path).

8. **Eligibility-rules ↔ presence linkage not yet wired.** `notification_configs.eligibility_rules` (PAD-128, migration `d5e6f7a8b9c0`) is the schema for the "bar to invite" but per its own migration docstring the rules are stored, not yet enforced against `Presence` history anywhere I found in this pass (enforcement logic would live in `notification_service.py`, not fully read). If the new feature is meant to feed eligibility decisions with attendance stats, that read-side wiring doesn't exist yet.

---

## 7. Conventions for adding a model/service/route/serializer

Summarized from `padel_app/models/MODELS.md` (the canonical doc — read in full, 477 lines) plus the `Presence`/`lesson_service.py`/`frontend_api.py` example already in the codebase:

### Model
- File in `padel_app/models/<name>.py`, class `db.Model, model.Model`.
- Required: `__tablename__` (snake_case plural), `__table_args__ = {"extend_existing": True}`, `page_title`, `model_name` (must match class name exactly — used by admin routing/reflection), `id = Column(Integer, primary_key=True)`.
- Every FK needs an explicit `ondelete` (`CASCADE` to delete-with-parent, `SET NULL` + `nullable=True` to orphan).
- Bidirectional relationships use `back_populates`, never `backref`.
- Enum columns must be given an explicit `name=` (Postgres named type) — e.g. `Enum("present","absent", name="lesson_presence_status")`.
- Must implement `display_all_info()` (admin list view: searchable field + columns) and `get_create_form()` (admin create/edit form: only two valid `Block` names, `"info_block"` and `"picture_block"`; every editable field must appear here or it's invisible to `update_with_dict`/the admin UI).
- Many-to-many with extra columns → a dedicated `Association_<A><B>` model (see `Association_PlayerLessonInstance` as the closest template for anything presence-adjacent); a plain junction table only when there are no extra columns.
- Register in `padel_app/models/__init__.py`: import the class and add a lowercase-no-underscore key to the `MODELS` dict.
- Free for the taking from the base class: `created_at`/`updated_at`, `create()`, `save()`, `delete()`, `update_with_dict(values)`, `get_dict()`, `get_edit_form()`.

### Migration
```bash
flask db migrate -m "add YourModel"   # from levelup_backend/, .venv active
flask db upgrade
```
Always hand-review the generated file — Alembic misses named-Enum creation on Postgres (must add `sa.Enum(...).create(op.get_bind(), checkfirst=True)` manually, and the matching `.drop()` in `downgrade()`).

### Service
Plain functions in `padel_app/services/<domain>_service.py`, no class wrapper convention observed (`lesson_service.py`, `attendance_history_service.py`, `notification_service.py` all follow this). Business logic — materialization, form binding (`JsonRequestAdapter` + `model.get_create_form()`/`get_edit_form()`), authorization-adjacent helpers, side effects (scheduler jobs, vacancy creation) — lives here, not in the route.

### Route
All in `padel_app/modules/frontend_api.py` on the single `bp` Blueprint (grouped by comment banners: READ / CREATE / etc.). Pattern for a new route:
1. `@bp.get/post/put/delete("/path")`
2. `@jwt_required()`
3. Resolve identity via `current_user()`/`current_coach()`/`current_player()` (memoized on Flask `g`), or the hard-fail variant `require_coach()` (aborts 403 rather than letting a `None` coach crash with `AttributeError` — this is the PAD-92/PAD-103/PAD-116 lesson baked into the codebase: **never branch on a truthy coach without also handling the student case explicitly documented at `frontend_api.py:230-243`**).
4. For coach-owned resources, use `require_owned_class(coach, model_name, class_id)` (`frontend_api.py:288`) or `coach_owns_instance`/`coach_owns_lesson` directly; for roster-scoped student data, `require_own_roster_relation(coach, player_id)` (`frontend_api.py:305`).
5. Call the service function; serialize the result with the matching `serializers/*.py` function; `return jsonify(...)`.
6. A body-supplied `coachId` is only ever an *assertion* checked against the JWT-derived coach (`assert_acting_coach`), never trusted as the actor.

### Serializer
Plain function `serialize_x(obj)` → dict with camelCase keys (frontend consumes JSON directly), in `padel_app/serializers/<name>.py`. No class/schema library — hand-written dict literals throughout.

### Tests
`padel_app/tests/`, fixtures in `conftest.py` (`app` = SQLite test DB, `client`, `seed_users`, `auth`), `make_coach(app)` helper in `tests/helpers.py`. Import services inside the test body (avoids circular imports), wrap DB ops in `with app.app_context():`, patch external I/O (Redis/push), use `now=` parameter injection instead of datetime mocking. Existing tests directly relevant to this domain: `test_confirm_presences.py`, `test_attendance_history_buckets.py`, `test_pad128_eligibility.py`, `test_dashboard_pending_confirmations.py` — good reference points for how attendance-adjacent behavior is tested here (not read in full this pass; worth a dedicated read before writing new tests).
