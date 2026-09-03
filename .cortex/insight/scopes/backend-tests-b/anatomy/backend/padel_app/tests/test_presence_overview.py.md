---
path: backend/padel_app/tests/test_presence_overview.py
extracted_at: 2026-09-03T13:59:54Z
extraction_level: 2
size_lines: 458
size_tokens: 4522
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "99b6654e46fab8067560abe045b5d4317365a5238f0ae14949e20dec499b00d1"
---

## Purpose

PAD-140 tests for the coach-facing Presences overview (`presence_overview_service`): roster stats, attendance trend, and the validation queue (specs `attendance.presence` validated field, `attendance.stats`). All three reads are scoped to one coach via `Association_CoachLesson` and derive "attended" from `Presence.status == "present"` so they can never disagree with `compute_player_kpis()` or the per-player history page. Pins `build_presence_stats` (per-player total/academy/private/justified/unjustified counts, roster-wide totals feeding KPI tiles); the subtle guest-detection rule (`test_guest_is_not_counted_as_enrolled`) — `Presence.invited` is `True` for *every* enrolled player at materialization, so it cannot identify a guest; a guest is instead a player with a presence but no `Association_PlayerLesson` row on the parent lesson; `build_presence_trend` (gap-filled day buckets so the chart x-axis stays continuous even over inactive days); `list_pending_validation` ("ready" means every enrolled player answered, not that the coach acted; future classes are excluded; a fully-validated class moves to the `validated` bucket; `unvalidate_instance` clears only the `validated` flag, preserving status/justification); that a coach-marked absence (`validated=True`) is never reported as a student decline (`response == "none"`); and `effective_filled_spots` counting walk-ins added via `lesson_service.add_presences` (counts `players_relations`, not raw `Presence` rows, so a walk-in occupies capacity without double-counting an already-enrolled player).

## Connections

- Uses: `padel_app.services.presence_overview_service` (`build_presence_stats`, `build_presence_trend`, `list_pending_validation`, `unvalidate_instance`), `padel_app.services.lesson_service.add_presences`, `padel_app.tests.helpers.make_coach` (scope `backend-tests-a`, only in `test_another_coachs_classes_are_invisible`), `padel_app.models.User`, `padel_app.models.coaches.Coach`, `padel_app.models.players.Player`, `padel_app.models.clubs.Club`, `padel_app.models.lessons.Lesson`, `padel_app.models.lesson_instances.LessonInstance`, `padel_app.models.presences.Presence`, `padel_app.models.Association_CoachClub`, `padel_app.models.Association_CoachLesson`, `padel_app.models.Association_CoachPlayer`, `padel_app.models.Association_PlayerLesson`, `padel_app.sql_db.db`; the `app` fixture from `conftest.py` (scope `backend-tests-a`).
- Used by: —
- Semantically related (not imports): none identified.
