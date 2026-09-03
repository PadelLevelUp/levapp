---
path: backend/padel_app/tests/test_season_service.py
extracted_at: 2026-09-03T13:59:54Z
extraction_level: 2
size_lines: 358
size_tokens: 3089
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "ee98080810b7742b59e7e459ff949cca76411df007709f577adeeeaee5b8ce79"
---

## Purpose

Tests for `services/season_service.py`'s CRUD and validation logic (no docstring/ticket header on the module itself, but most tests are tagged PAD-89). Pins `validate_no_overlap` (rejects overlapping date ranges with `ValueError("Overlapping seasons")`, accepts an adjacent non-overlapping range, rejects `start >= end` with `ValueError("Season start must be before end")`) and `resolve_season_end_for_coach` (returns the covering season's end date, or `None` if no season covers the given date). The larger block is `upsert_seasons` (PAD-89): updates an addressed row (by `id`) in place rather than deleting-and-recreating it; a season OMITTED from the payload must survive (the pre-fix bug: since the web client never sent `id` at all, every "Save seasons" click wiped and recreated the whole set — silent data loss); a payload overlapping a persisted season the payload does not address is rejected and nothing is written or destroyed; a season CAN be moved over its own existing range without tripping the self-overlap check; explicit removal is only via `delete_season`, never by omission from an upsert payload. Two integration tests cross into `lesson_service`: `add_class_service` sets `recurrence_end` to the covering season's end when `recursUntilSeasonEnd=True` (same invariant as `test_recurs_until_season_end.py`), and `regenerate_future_instances_for_season` caps a lesson's `recurrence_end` to the (possibly-shortened) season end and prunes only `LessonInstance` rows starting after that boundary, keeping ones before it.

## Connections

- Uses: `padel_app.tests.helpers.make_coach` (scope `backend-tests-a`, not in this scope), `padel_app.services.season_service` (`validate_no_overlap`, `resolve_season_end_for_coach`, `upsert_seasons`, `list_seasons`, `delete_season`, `regenerate_future_instances_for_season`), `padel_app.services.lesson_service.add_class_service`, `padel_app.models.Coach`, `padel_app.models.Season`, `padel_app.models.Club`, `padel_app.models.Association_CoachClub`, `padel_app.models.Lesson`, `padel_app.models.LessonInstance`, `padel_app.models.Association_CoachLesson`, `padel_app.sql_db.db`; the `app` fixture from `conftest.py` (scope `backend-tests-a`).
- Used by: —
- Semantically related (not imports): `test_recurs_until_season_end.py` (shares the exact `recurs_until_season_end`/`recurrence_end` invariant, `add_class_service` fail-closed vs. bounded-by-season behaviour, from the class-creation-fail-closed angle rather than the season-CRUD angle).
