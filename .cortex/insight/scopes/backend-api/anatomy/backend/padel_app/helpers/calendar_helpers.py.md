---
path: backend/padel_app/helpers/calendar_helpers.py
extracted_at: 2026-09-03T15:00:00Z
extraction_level: 3
size_lines: 263
size_tokens: 2085
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "af46f835196d516d8a3ecfba020f55522ed0dcb9c2d6985b91732bd3b46632fd"
---

## Purpose

Core calendar-occurrence engine: loads `Lesson`/`LessonInstance`/`CalendarBlock` rows scoped to a coach or player and a date range, expands recurring lessons/blocks into concrete occurrences via `expand_occurrences`, and serializes them into calendar events — reconciling each occurrence against any already-materialized `LessonInstance` so an instance's real state (attendance, overrides) takes priority over the template's recurrence rule. This is the single source of truth every calendar-shaped surface in the app (the calendar view, the dashboard, notification targeting) reads occurrences through.

## Main players

- `load_lessons_for_coach(coach_id, range_start, range_end)` (lines 19-34) — critical. Base `Lesson` templates for a coach, filtered to `status == "active"` and either non-recurring or still recurring past `range_start`.
- `load_lesson_instances_for_coach(coach_id, range_start, range_end)` (lines 37-69) — critical. Materialized instances in range, eager-loading `players_relations`/`presences` (PAD-71: `LessonInstance.effective_filled_spots` walks both, so eager-loading keeps a week of classes at constant query count) and falling back to the parent lesson's coach relations when an instance has none of its own. Returns a dict keyed by `(lesson_id, original_lesson_occurence_date)`.
- `load_lessons_for_player` / `load_lesson_instances_for_player` (lines 75-159) — critical. Player-scoped equivalents. The instance loader's source-of-truth priority is explicit in the docstring: `Presence` rows first (invited/confirmed state), then `Association_PlayerLessonInstance` as a fallback via `setdefault` (never overwrites a presence-derived entry).
- `build_lesson_events(lessons, instances_by_key, range_start, range_end)` (lines 162-196) — critical. For every lesson, expands its occurrences and emits a serialized event per occurrence — using the materialized `LessonInstance` when one exists for that `(lesson_id, date)` key, else a synthetic "virtual" event (`override_id=f"lesson-{lesson.id}-{occ_date}"`) built straight from the template. A second pass appends any instance in `instances_by_key` that was never matched to an expanded occurrence (e.g. an instance whose parent lesson recurrence no longer produces that date), so instances are never silently dropped.
- `build_block_events` / `load_calendar_blocks_for_user` (lines 199-237) — supporting. Same expand-and-serialize pattern for `CalendarBlock` (time-off/unavailability), no materialization concept — every occurrence is synthetic.
- `build_coach_calendar_events` / `build_player_calendar_events` (lines 239-263) — critical. Top-level orchestrators combining lesson events and (optionally) block events for one role; these are the two functions most callers actually reach for.

## Insights

- The dict key `(lesson_id, original_lesson_occurence_date)` is load-bearing: it is how a materialized `LessonInstance` gets matched back to the specific recurring occurrence it represents, rather than to the lesson in general. Any code that materializes an instance without setting `original_lesson_occurence_date` to the occurrence's own date breaks this matching silently (the instance falls into the "orphaned" second pass in `build_lesson_events` instead of replacing its occurrence).
- `load_lesson_instances_for_coach` resolves the acting coach two ways — `instance.coaches_relations` if the instance has its own coach assignment, else the parent lesson's — meaning a materialized instance CAN have a different coach roster than its template (e.g. a substitute teacher for one occurrence), and this function is what makes that override visible to the coach's calendar.
- `build_lesson_events`'s two-pass design (expand-then-reconcile, then append leftovers) means a `LessonInstance` whose `original_lesson_occurence_date` no longer falls within its lesson's current recurrence rule (e.g. the coach edited the recurring days after the instance was already materialized) still shows up on the calendar — it just won't line up with the rule's own generated occurrences.

## Connections

- Uses: `padel_app.tools.calendar_tools.expand_occurrences` for recurrence expansion; `padel_app.models` (`Lesson`, `LessonInstance`, `CalendarBlock`, `Association_CoachLesson`, `Association_PlayerLesson`, `Association_PlayerLessonInstance`, `Presence`); `padel_app.serializers.calendar_event.serialize_calendar_event`; `sqlalchemy.orm.selectinload`
- Used by: `padel_app/helpers/dashboard/events.py` and `padel_app/helpers/dashboard/coach_home.py` (same scope) for dashboard lesson lists; `padel_app/modules/frontend_api.py` (same scope) for the calendar API routes; `padel_app/services/lesson_service.py` (outside this scope) for lesson materialization logic

## Query pointers

If you need to change how a recurring lesson expands into occurrences, also read: `padel_app/tools/calendar_tools.py` (`expand_occurrences`, `build_rrule`).
If you need to change what a calendar event looks like on the wire, read first: `padel_app/serializers/calendar_event.py` (outside this scope), then: this file's `build_lesson_events`/`build_block_events` call sites.
If you're debugging a class that's missing from — or duplicated on — a coach's or player's calendar, read: `load_lesson_instances_for_coach`/`load_lesson_instances_for_player` (how instances are matched) and `build_lesson_events` (how they're reconciled against expanded occurrences).
