---
path: backend/padel_app/tests/test_pad85_duplicate_materialization.py
extracted_at: 2026-09-03T13:59:54Z
extraction_level: 2
size_lines: 301
size_tokens: 3005
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "ee202a97e0da08117412365850bdd0cc52d64dd99ad767758b0197234bfd1df6"
---

## Purpose

PAD-85 regression tests for `lesson_service.get_or_materialize_instance(lesson, date)`, which used to look up an existing `LessonInstance` by the PARENT lesson's time-of-day (`start_datetime=datetime.combine(date, lesson.start_datetime.time())`). When a single occurrence was edited to a different time ("this occurrence only"), the materialized override's `start_datetime` no longer matched the parent's, so the lookup missed and a SECOND `LessonInstance` (with a fresh set of unconfirmed `Presence` rows) was materialized for the same logical occurrence — the reminder-double-send path behind PAD-69, since the reminder runner calls `get_or_materialize_instance` on every pass. Tests pin that the lookup is now keyed on occurrence identity (`lesson_id` + `original_lesson_occurence_date`), robust to time divergence: editing an occurrence's time via `edit_class_service` then re-materializing returns the SAME instance and creates no duplicate row; a student's already-recorded `Presence.confirmed=True` answer on instance A survives a follow-up materialization pass unchanged (exactly one `Presence`, still confirmed) even after the occurrence's time was edited in between. `test_materialize_with_standing_waiting_list_entry_does_not_close_transaction` is a regression for the 2026-07-27 prod incident (`sqlalchemy.exc.ResourceClosedError`) caused by `_sync_standing_entries_for_new_instance` committing from inside the caller's SAVEPOINT — same incident as `test_pad117_savepoint_containment.py`, tested here from the duplicate-materialization angle rather than the savepoint-containment-shape angle.

## Connections

- Uses: `padel_app.services.lesson_service` (`edit_class_service`, `get_or_materialize_instance`), `padel_app.models.User`, `padel_app.models.coaches.Coach`, `padel_app.models.clubs.Club`, `padel_app.models.Association_CoachClub`, `padel_app.models.Association_CoachLesson`, `padel_app.models.Association_PlayerLesson`, `padel_app.models.lessons.Lesson`, `padel_app.models.LessonInstance`, `padel_app.models.Presence`, `padel_app.models.Player`, `padel_app.models.standing_waiting_list_entry.StandingWaitingListEntry`, `padel_app.models.waiting_list_entry.WaitingListEntry`, `padel_app.sql_db.db`; the `app` fixture from `conftest.py` (scope `backend-tests-a`).
- Used by: —
- Semantically related (not imports): `test_pad117_savepoint_containment.py` (shares the exact 2026-07-27 `ResourceClosedError` prod incident and the `_sync_standing_entries_for_new_instance` savepoint code path, via its own `test_materialize_with_standing_waiting_list_entry_does_not_close_transaction`).
