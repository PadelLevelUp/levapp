---
path: backend/padel_app/tests/test_pad128_eligibility.py
extracted_at: 2026-09-03T13:59:54Z
extraction_level: 2
size_lines: 579
size_tokens: 6522
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "2d37e47bd1efe1c20aeaa8219b41795d2b1715601a9e6635036578974ae0dddf"
---

## Purpose

PAD-128 Eligibility Phase 1 tests (specs `eligibility.rules` rules 1,2,3,4,6 and `eligibility.enforcement` rules 1,2,4,5,10; also covers PAD-122/PAD-123, fixed by the same rewire). Pins the core "bar" resolver `effective_eligibility`/`passes_eligibility` in `notification_service`: an unset (`None`) or empty (`[]`) `eligibility_rules` admits everyone and NULL must never resolve to a default rule set (`test_unset_bar_is_never_defaulted_to_a_rule_set` explicitly asserts no `DEFAULT_ELIGIBILITY_RULES` constant exists — that's the PAD-122 root cause it guards against); a `level`/`same_as_class` rule against a class with no level at all admits NOBODY, fail-closed (PAD-86); `within_n_of_class` follows ladder position (`display_order`) rather than level values; `side` never affects the bar; `unjustified_absences` reads the coach-scoped `Presence` record. `test_widest_wave_stops_at_the_bar` proves the widest invitation group (no rules of its own) still respects a configured bar. Two waiting-list tests use an EXPLICIT bar (PAD-122: `_check_waiting_list` must not bypass eligibility or `restrictions.excludedPlayers`) while two others deliberately run with `eligibility_rules=None` (PAD-123: the enrolled/`absent` exclusion in `_check_waiting_list` is unconditional and must not ride on the bar — a cancelling student is never re-placed into their own vacancy, and an already-enrolled student is never a fill candidate). Final test round-trips `eligibilityRules` through `get_config_dict`/`update_config`, asserting `null` survives as `None` rather than becoming `[]`, and that an omitted key leaves the stored bar untouched.

## Connections

- Uses: `padel_app.services.notification_service` (`effective_eligibility`, `passes_eligibility`, `_get_eligible_students_for_group`, `_check_waiting_list`, `get_config_dict`, `update_config`), `padel_app.models.User`, `padel_app.models.coaches.Coach`, `padel_app.models.clubs.Club`, `padel_app.models.coach_levels.CoachLevel`, `padel_app.models.lessons.Lesson`, `padel_app.models.lesson_instances.LessonInstance`, `padel_app.models.Association_CoachLessonInstance`, `padel_app.models.Association_CoachPlayer`, `padel_app.models.notification_config.NotificationConfig`, `padel_app.models.presences.Presence`, `padel_app.models.vacancy.Vacancy`, `padel_app.models.waiting_list_entry.WaitingListEntry`, `padel_app.models.Association_PlayerLessonInstance`, `padel_app.models.players.Player`, `padel_app.utils.dates.utcnow_naive`, `padel_app.sql_db.db`; the `app` fixture from `conftest.py` (scope `backend-tests-a`).
- Used by: `test_pad133_eligibility_reasons.py` (imports `_seed`, `_add_student`, `_cp` directly, extending this file's fixture suite for the eligibility-reasons/manual-add surface).
- Semantically related (not imports): none identified beyond the direct import above.
