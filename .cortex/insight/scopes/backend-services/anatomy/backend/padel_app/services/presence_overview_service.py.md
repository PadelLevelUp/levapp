---
path: backend/padel_app/services/presence_overview_service.py
extracted_at: 2026-09-03T13:58:46Z
extraction_level: 2
size_lines: 392
size_tokens: 3803
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "ac03fb3108ccd103a06b88328289822274ca176a79f4f91d36244662de272df7"
---

## Purpose

The coach's roster-wide "Presences" tab (PAD-140): `build_presence_stats`
(per-player metric table — totals, private vs academy, justified vs
unjustified absences, guest attendances), `build_presence_trend` (one
roster-wide time series reusing `attendance_history_service`'s bucketing
rules), and `list_pending_validation`/`unvalidate_instance` (the
attendance-validation queue — classes that have already ended, split
into pending vs validated, with an Undo path). All three read surfaces
are scoped to one coach via the `Association_CoachLesson` join on each
class's parent lesson.

## Connections

- Uses: `padel_app.models` (`Association_CoachLesson`,
  `Association_CoachPlayer`, `Association_PlayerLesson`, `Lesson`,
  `LessonInstance`, `Player`, `Presence`);
  `services/attendance_history_service.py` (`GRANULARITIES`,
  `_as_naive_utc`, `_bucket_series`, `_bucket_start`, `pick_granularity`
  — reused directly, not reimplemented); `padel_app.sql_db.db`.
- Used by: presence-overview routes (outside this scope, in the API layer).

## Insights

- Guest-attendance definition, stated explicitly in the module
  docstring and load-bearing across the codebase: `Presence.invited` is
  NOT a guest signal — it is set `True` for every enrolled player at
  materialization (`lesson_service.get_or_materialize_instance`). A
  guest is instead defined by the LEFT JOIN in `_coach_presence_query`:
  a presence exists but no matching `Association_PlayerLesson` row for
  the parent lesson — i.e. someone invited into a one-off spot rather
  than enrolled in the recurring class. See also
  `presence-invited-is-not-a-guest-signal`.
- `_response_state`'s `validated` guard resolves an ambiguity that would
  otherwise misattribute a coach's own action to the student: marking a
  player absent from the class-detail sheet writes the exact same
  columns (`status='absent'`, `confirmed=False`) a student's own decline
  does. The distinguishing signal is that `add_presences` additionally
  stamps `validated=True` — so a `validated` record showing `absent`
  with no `confirmed` is read as `"none"` (no RSVP), not `"declined"`,
  to avoid falsely reporting "the student said they couldn't come" for
  a decision the student never made.
- There is no class-level "validated" flag by design (`calendar.view`
  rule 11: a class's `completed` status must derive purely from the
  clock, never be coach-settable) — validation state is derived by
  checking whether EVERY presence on an instance is validated.
- `default_overview_range` deliberately differs from
  `attendance_history_service.default_range`: 90 trailing days instead
  of the current month, because a roster-wide trend for a small academy
  can be too sparse over just one month.
