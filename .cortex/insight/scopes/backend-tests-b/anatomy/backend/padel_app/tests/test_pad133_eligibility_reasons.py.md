---
path: backend/padel_app/tests/test_pad133_eligibility_reasons.py
extracted_at: 2026-09-03T13:59:54Z
extraction_level: 2
size_lines: 405
size_tokens: 4339
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d143a8ec06eb631c2c72eb09ae00d10ad503f3f47b55b604fd0039a7155a6ff8"
---

## Purpose

PAD-133 tests for `eligibility.enforcement` rules 6-9: the manual-add warning that names WHY a student fails the bar, and the stricter-bar save report. `test_failures_and_bool_never_disagree` is called out in the module docstring as "the single most important test in this file" — it sweeps 5 bar configurations x 4 students (20 checks) asserting `passes_eligibility(...)` and `eligibility_failures(...)` (in `notification_service`) always agree, since both must run the SAME evaluator or the client could warn about a student it silently enrolls (or vice versa). Pins the failure record shape: `level` failures carry `actual`/`threshold` (student's vs class's level code) and a signed `ladder_distance` (positive = weaker/below, negative = stronger/above); `unjustified_absences` failures carry the real count, not a bool; fail-closed cases (e.g. student with no level) carry a machine-readable `reason` (`"student_has_no_level"`) since `actual`/`threshold` can't be meaningful. `test_every_failed_rule_is_reported_not_just_the_first` guards against short-circuiting in the explanation path, while `test_bool_path_still_short_circuits` proves the fast boolean path (`_group_rule_failures(..., short_circuit=True)`) still stops at the first failure for hot-loop performance, with both paths agreeing on the verdict. Also covers the manual-add surface (`eligibility_failures_for_players` — only failing students listed, silent when no bar, ignores off-roster players) and the stricter-bar save report (`students_failing_eligibility_bar` — names enrolled students who would newly fail a stricter bar without ever un-enrolling anyone (rule 8), and ignores classes that already happened).

## Connections

- Uses: `test_pad128_eligibility.py` (imports `_seed`, `_add_student`, `_cp` directly rather than redefining them), `padel_app.services.notification_service` (`passes_eligibility`, `eligibility_failures`, `_group_rule_failures`, `eligibility_failures_for_players`, `students_failing_eligibility_bar`), `padel_app.models.lesson_instances.LessonInstance`, `padel_app.models.Association_CoachLessonInstance`, `padel_app.models.Association_PlayerLessonInstance`, `padel_app.utils.dates.utcnow_naive`, `padel_app.sql_db.db`; the `app` fixture from `conftest.py` (scope `backend-tests-a`).
- Used by: —
- Semantically related (not imports): none identified beyond the direct import above.
