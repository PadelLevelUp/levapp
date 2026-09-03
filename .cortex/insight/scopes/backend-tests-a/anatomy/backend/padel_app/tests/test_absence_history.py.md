---
path: backend/padel_app/tests/test_absence_history.py
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 243
size_tokens: 2391
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "f4c35298105fb5ce487e32e598dc0186c56ee71eb098bbf796f7348a8b436988"
---

## Purpose

PAD-141 — pins `build_absence_history` (and its relationship to
`build_attendance_history`) against spec `attendance.absences`. Seeds one
player with 2 attended and 2 missed classes (one justified, one not) and
asserts: only absences appear (not attendance); the attendance and absence
histories are disjoint sets over the same underlying presences; the
absence total equals the dashboard "Missed" KPI
(`compute_player_kpis().lessons_missed`), so the page and its own
entry-point card cannot silently disagree; both justified and unjustified
absences count toward the total (a filtered-out-justified regression would
fail this); `include_justification` stays opt-in so `build_attendance_history`'s
shipped response shape is unchanged; buckets are gap-filled per-day across
the window; and each session's `href`/`calendarEventId` use the
`lessoninstance-<id>` deep-link form.

## Connections

- Uses: `padel_app.services.attendance_history_service`
  (`build_absence_history`, `build_attendance_history`) for the behaviour
  under test; `padel_app.helpers.dashboard.kpis` (`compute_player_kpis`)
  to cross-check the KPI agreement rule; `padel_app.models` (`User`,
  `LessonInstance`, `Presence`), `padel_app.models.clubs.Club`,
  `padel_app.models.coaches.Coach`, `padel_app.models.players.Player`,
  `padel_app.models.lessons.Lesson` for fixture seeding via `_seed_history`.
- Used by: (none — leaf test file)
- Semantically related (not imports): shares the day-bucketing contract
  with `test_attendance_history_buckets.py` (both cover
  `attendance_history_service`, one DB-backed for the cross-KPI rule, one
  pure-logic for the granularity/bucket math).
