---
path: backend/padel_app/tests/test_recurs_until_season_end.py
extracted_at: 2026-09-03T13:59:54Z
extraction_level: 2
size_lines: 226
size_tokens: 1856
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "5b150a586dfe78d7c0743f670ea795ef991e6b7a1a5f2935ef1859138e12a70c"
---

## Purpose

PAD-90 tests (spec `calendar.seasons`) pinning that "recurs until season end" fails closed. Ticking that option on a recurring class snapshots the coach's season end into `lessons.recurrence_end`; when no season covers the class's start date the resolver used to leave `recurrence_end` NULL, and `calendar_helpers` treats NULL as "no end" — so the class recurred forever with no signal to the coach. Now the contract is fail-closed: `lesson_service.add_class_service` raises `NoSeasonCoversDateError` and writes nothing, both when the coach has zero seasons at all and when a season exists but doesn't cover the start date. Pins the happy path is unchanged (`recurrence_end` == the covering season's end date), the core invariant directly (`Lesson.recurs_until_season_end=True` can never coexist with `recurrence_end IS NULL`), and that toggling the flag off still honours a plain typed end date. At the route layer, `POST /api/app/add_class` returns 400 with a machine-readable `code: "no_season_covers_date"` and creates no `Lesson`, or 200 with the season-bounded `recurrence_end` when a covering season exists.

## Connections

- Uses: `padel_app.tests.helpers.make_coach` (scope `backend-tests-a`, not in this scope), `padel_app.services.lesson_service` (`add_class_service`, `NoSeasonCoversDateError`), `padel_app.models.Coach`, `padel_app.models.Lesson`, `padel_app.models.Club`, `padel_app.models.Association_CoachClub`, `padel_app.models.Season`, `padel_app.sql_db.db`; `flask_jwt_extended.create_access_token` for the route-layer tests; the `app` and `client` fixtures from `conftest.py` (scope `backend-tests-a`).
- Used by: —
- Semantically related (not imports): `test_season_service.py` (`season_service.py` is the module resolving/managing `Season` rows this file's `add_class_service` calls into; both scopes exercise the same season-coverage domain from different angles — season CRUD vs. class-creation fail-closed behavior).
