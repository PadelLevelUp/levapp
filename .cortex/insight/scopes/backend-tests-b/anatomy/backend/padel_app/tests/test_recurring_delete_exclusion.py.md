---
path: backend/padel_app/tests/test_recurring_delete_exclusion.py
extracted_at: 2026-09-03T13:59:54Z
extraction_level: 2
size_lines: 219
size_tokens: 2177
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "64bc47fff868e88070982f4ff3bc586d9ec9c5145233f9046f2b6359fdb929ea"
---

## Purpose

PAD-65 tests pinning that deleting a single (possibly edited) occurrence of a recurring class stays deleted. Editing one occurrence materializes a `LessonInstance` override; deleting it with `scope="single"` used to do a bare `obj.delete()` without excluding the date from the parent recurrence, so the series re-projected the occurrence (with its pre-edit values) on reload — "the coach deleted it and it came back". The fix excludes the original occurrence date from the parent recurrence, mirroring the `Lesson` `scope="single"` path. Tests: deleting an edited (materialized, title-changed) occurrence via `remove_class_service({model: "LessonInstance", scope: "single"})` — it must not reappear under either its original or edited title, while sibling occurrences remain; deleting a non-edited occurrence via the `model="Lesson"` path (the latent split_lesson off-by-one PAD-10 never asserted) — same exclusion must apply; and deleting a materialized instance of a NON-recurring lesson, which is just removed outright (no recurrence to exclude).

## Connections

- Uses: `padel_app.services.lesson_service` (`get_or_materialize_instance`, `remove_class_service`, `get_lesson_instances_in_range`), `padel_app.models.User`, `padel_app.models.coaches.Coach`, `padel_app.models.clubs.Club`, `padel_app.models.Association_CoachClub`, `padel_app.models.Association_CoachLesson`, `padel_app.models.lessons.Lesson`, `padel_app.models.lesson_instances.LessonInstance`, `padel_app.sql_db.db`; the `app` fixture from `conftest.py` (scope `backend-tests-a`).
- Used by: —
- Semantically related (not imports): `test_pad85_duplicate_materialization.py` and `test_pad117_savepoint_containment.py` (all three exercise `get_or_materialize_instance`/occurrence-identity edge cases in `lesson_service`, from deletion, duplication, and savepoint angles respectively).
