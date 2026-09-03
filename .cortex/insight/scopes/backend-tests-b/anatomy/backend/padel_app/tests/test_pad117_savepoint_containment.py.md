---
path: backend/padel_app/tests/test_pad117_savepoint_containment.py
extracted_at: 2026-09-03T13:59:54Z
extraction_level: 2
size_lines: 340
size_tokens: 3440
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "c12b1987b9c342718178b034e91eb50a0f07dc18b5999282c8225d9e8bef4315"
---

## Purpose

PAD-117 tests pinning the SAVEPOINT guard in `lesson_service.get_or_materialize_instance` (invoked via `POST /api/app/notify/send_reminders`). The guarded block fans standing waiting-list entries out to a newly materialized instance inside `db.session.begin_nested()`; before the fix, a callee that committed the outer transaction and *then* raised (`_commit_then_raise`, the PAD-113 shape) escaped as a 500 `ResourceClosedError` because `sp.rollback()` in the `except` handler raised the same error the `try` body did — while a plain exception (`_plain_raise`) was already correctly absorbed. Tests assert on effects, not just status: a 200 with the reminder never actually delivered is called out as "worse than the 500" the ticket warns about. Also pins that a transaction-closing failure is contained but still logged at ERROR (diagnosability), that the happy path still fans out normally with no injected failure, and separately that a failure *opening* the savepoint itself (`begin_nested()` raising) surfaces its own cause rather than an `UnboundLocalError` from a handler referencing a never-assigned `sp` — the masking bug fixed by moving `begin_nested()` outside the `try`.

## Connections

- Uses: `padel_app.services.lesson_service.get_or_materialize_instance`, `padel_app.services.notification_service._sync_standing_entries_for_new_instance` (patched with injected failure side effects, and its `publish`/`send_push_notification` I/O patched via `_patched_io`), `padel_app.models.users.User`, `padel_app.models.coaches.Coach`, `padel_app.models.players.Player`, `padel_app.models.clubs.Club`, `padel_app.models.lessons.Lesson`, `padel_app.models.Association_CoachClub`, `padel_app.models.Association_CoachLesson`, `padel_app.models.Association_PlayerLesson`, `padel_app.models.Association_CoachPlayer`, `padel_app.models.standing_waiting_list_entry.StandingWaitingListEntry`, `padel_app.models.Message`, `padel_app.models.LessonInstance`, `padel_app.models.waiting_list_entry.WaitingListEntry`, `padel_app.sql_db.db`; the `app` and `client` fixtures from `conftest.py` (scope `backend-tests-a`); `flask_jwt_extended.create_access_token` for the authenticated POST.
- Used by: —
- Semantically related (not imports): `test_pad85_duplicate_materialization.py::test_materialize_with_standing_waiting_list_entry_does_not_close_transaction` (same `get_or_materialize_instance` + standing-waiting-list-entry ResourceClosedError incident, tested from the materialization-duplication angle instead of the savepoint-containment angle — same 2026-07-27 prod incident referenced in both files).
