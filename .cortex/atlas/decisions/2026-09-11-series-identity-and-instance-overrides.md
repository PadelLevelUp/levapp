---
id: decision.2026-09-11-series-identity-and-instance-overrides
title: "Draft skeleton: series identity, per-instance overrides, coaches derived from the lesson (PAD-275, audit M1b/M2/M7)"
date: 2026-09-11T00:00:00Z
compass_rules: []
related_specs:
  - classes.recurrence
  - classes.edit
  - classes.instances
  - classes.coach-assignment
  - calendar.view
supersedes: []
sources:
  - ../../archive/documents/data-model-audit-2026-09-02/extracted/findings.md
  - 2026-09-10-data-model-audit-follow-up.md
---

# Draft skeleton: series identity, per-instance overrides, coaches derived from the lesson

**Status:** SPEC WRITTEN on the recommended defaults (coordinator, 2026-09-11): classes.recurrence rules 6–7, classes.edit rule 4, classes.coach-assignment rules 3–4, classes.delete rule 3, entity lines, one business rule. All four columns (series_id, excluded_dates, max_players_override, coach_override_id) and their migration are HELD until the owner answers decisions 9–11; the code-only parts (fork copies every column; overwrite_title only when different; derived overriddenFields) are implemented first. Tests: test_pad275_series_and_overrides.py (held cases skipped with the reason). Session H, 2026-09-11, against `staging` 72ac170a8. Independent
of PAD-259 at the table level (it touches `lessons` and `lesson_instances`, not enrolment), but it
is coded after PAD-259 and PAD-271 so the three migrations chain in one order. The audit already
rejected virtual occurrences plus an exceptions table (follow-up decision of 2026-09-10); this
skeleton stays inside that.

## M7: "this and future" forks the lesson with no link back

**Today.** `split_lesson` (`lesson_service.py:517-548`) duplicates the lesson through
`duplicate_lesson_helper` (`489-530`), truncates the original's `recurrence_end`, re-parents
future instances to the new row, and re-schedules reminders. The copy drops `description` and
`notifications_enabled`; nothing records that the two rows are one series; a single-occurrence
delete takes the same path. Consequences: a series rename or roster change stops at the fork; the
coach's "my classes" lists one class twice; reminder jobs are re-created on every fork.

**Proposed.** `lessons.series_id` (nullable FK to `lessons.id`, self-referencing, `ON DELETE SET
NULL`), set to the root lesson's id on every fork and to the lesson's own id on creation; and
`lessons.excluded_dates` (JSON array of ISO dates) so a single-occurrence delete records an
exclusion instead of forking. `duplicate_lesson_helper` copies every column (build the copy from
the mapper, not a hand-written list, so the next new column cannot be forgotten). Reminder jobs are
moved, not re-created, on a fork.

**Backfill.** `series_id = id` for every lesson. Reconnecting past forks is heuristic (same coach,
same weekday and time, the older row's `recurrence_end` the day before the newer row's start, same
title): run the query on the staging copy of prod first, list the candidate pairs in the PR, and
link only exact matches. Unlinked forks stay their own series; nothing breaks.

## M1b: materialisation copies template fields

**Today.** `create_lesson_instance_helper` copies title, times, level, notifications flag and
capacity from `data_for_instance()` (`models/lessons.py`); `overwrite_title` is always populated
(`lesson_service.py:220`), so a series rename never reaches materialised occurrences; the
`overridden_fields` text column is serialised but never written (`classes.edit` rule 4
unimplemented).

**Proposed.** Store only overrides, NULL meaning "inherit": `overwrite_title` (already nullable,
stop populating it), `level_id` (already nullable; today filled from the lesson's default), a new
nullable `max_players_override` (today `max_players` is NOT NULL and copied). Times stay copied,
because an occurrence's time is its own fact once a single-occurrence edit moves it. Readers use
`instance.title`, `effective_level_id` and a new `effective_max_players` property, all of which
already exist or have a precedent (`title` at `lesson_instances.py:134`, PAD-86's level fallback).
`overridden_fields` becomes derived (the set of non-NULL override columns) and the text column is
dropped.

**Backfill.** `overwrite_title = NULL WHERE overwrite_title = lesson.title`; `level_id = NULL
WHERE level_id = lesson.default_level_id`; `max_players_override = NULL WHERE max_players =
lesson.max_players`, else the copied value. Counts of rows that keep an override go in the PR body.
`max_players` stays for one release as a shadow (written from the effective value) so nothing that
reads it directly breaks before the readers move, then drops.

## M2: coach ownership in two junctions, code assumes one coach

**Today.** `coach_in_lesson` and `coach_in_lesson_instance`; the calendar falls back from the
instance to the lesson (`calendar_helpers.py:58-65`); the engine roster fan-out and the eligibility
report read only the instance junction (9 of 13 dev instances had none); every engine path takes
`.first()` as the coach (`notification_service.py:393-398, 1822-1824, 2244-2246, 3821-3824`).

**Proposed.** Instance coaches are derived from the lesson. `coach_in_lesson_instance` is replaced
by a nullable `lesson_instances.coach_override_id` for a substitute on one occurrence; a helper
`coaches_for(instance)` returns the override if set, else the lesson's coaches. The `.first()`
sites become "the lesson's first coach" through the helper, which is the same answer today with
one source. Multi-coach remains half-supported (out of scope, `classes.coach-assignment` rule 1).

**Backfill.** Where an instance's junction has exactly one coach that is not on the lesson, set
`coach_override_id`; where it matches the lesson, drop it; more than one coach on an instance is
listed in the PR for a hand decision. Then drop the junction in a later PR.

## Migration order and blast radius

One migration per finding, chained after PAD-271's. M7 is additive (two columns). M1b and M2 each
add a column and keep the old one for a release before dropping. No client changes: the payloads
(`name`, `levelId`, `maxPlayers`, `coachId`) keep their meaning. Web and iOS ship nothing, and the
PR body says so.

## Decisions

1. Single-occurrence delete is an exclusion (`excluded_dates`), never a fork: YES, decided 2026-09-11 (coordinator, owner informed).
2. Reconnect historical forks by heuristic: NO — they stay separate series; `series_id = id` for every existing lesson, decided 2026-09-11 (coordinator, owner informed).
3. Multi-coach occurrences: KEEP `coach_in_lesson_instance`; no `coach_override_id`, no data move; the code reads a primary coach through one helper (`coaches_for(instance)` = the instance's junction rows if any, else the lesson's; `primary_coach(instance)` = the first), decided 2026-09-11 (coordinator, owner informed).
