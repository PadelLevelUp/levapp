---
path: backend/padel_app/tests/test_effective_level_resolution.py
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 405
size_tokens: 3934
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "52c7097c4439a35c4148ce7c9680a0ad1e0762c075796e620ddc7904de30d158"
---

## Purpose

PAD-86 — the invitation engine must resolve a class's level THE SAME WAY
everywhere. Reported bug: a class whose level lives only on the parent
`Lesson` (`lesson.default_level_id`, not the instance) produced structural
vacancies with `level_id = None`; `_passes_group_rules()` then treated
"no level on the vacancy" as "the level filter is off", so a level-only
invitation group silently matched the coach's ENTIRE roster — the
opposite of the configured intent — and the `{level}` message placeholder
rendered empty. Fix: one `effective_level_id()` helper (instance level,
falling back to the parent lesson's default) used everywhere, plus level
rules that FAIL CLOSED when there is genuinely no level anywhere.
`TestEffectiveLevelId` pins the helper's precedence (instance wins over
lesson fallback, `None` when neither exists, accepts a `Lesson` directly,
safe on `None`). `TestStructuralVacancyLevel` pins
`_create_structural_vacancies` inherits the lesson's default level,
prefers the instance level when both exist, and has no level when there's
genuinely none. `TestGroupEligibilityForStructuralVacancy` is the
end-to-end case: a level-only group with a level-inherited (not
instance-set) vacancy invites same-level students only, not the whole
roster. `TestLegacyVacancyFallback` pins that pre-fix `Vacancy` rows with
`level_id=NULL` still resolve correctly against the class's level rather
than failing closed (backward compatibility for rows written before this
fix). `TestLevelRulesFailClosed` pins that with NO level on the vacancy
AND no level on the player, every level-rule operation
(`same_as_vacancy`/`one_above_vacancy`/etc.) rejects everyone, while
non-level rules (or no rules) are unaffected. `TestLevelPlaceholder` pins
`effective_level_code` falls back the same way and renders `""` (not a
crash) when there's no level.

## Connections

- Uses: `padel_app.services.notification_service`
  (`effective_level_id`, `effective_level_code`,
  `_create_structural_vacancies`, `_get_eligible_students_for_group`,
  `_passes_group_rules`, `get_or_create_config`); models
  `padel_app.models.users.User`, `padel_app.models.coaches.Coach`,
  `padel_app.models.coach_levels.CoachLevel`, `padel_app.models.players.Player`,
  `padel_app.models.Association_CoachPlayer`, `padel_app.models.clubs.Club`,
  `padel_app.models.lessons.Lesson`, `padel_app.models.lesson_instances.LessonInstance`,
  `padel_app.models.Association_CoachLessonInstance`, `padel_app.models.vacancy.Vacancy`.
- Used by: (none — leaf test file)
- Semantically related (not imports): shares the invitation-engine level/
  vacancy domain and `_FakeVacancy`/`_create_coach`/`_create_level`/
  `_create_coach_player` helper naming pattern with
  `test_level_ladder_ordering.py` (near-duplicate helpers, different
  focus: ladder ordering vs. level resolution fallback).
