---
path: backend/padel_app/serializers/calendar_event.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 131
size_tokens: 1246
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "0194ab9b1721d09ea44dfa19b01fcb63988174e7a164be93e0369ad818e71a0c"
---

## Purpose

The single unifying serializer for the calendar UI: `serialize_calendar_event(obj, ...)` dispatches on `obj.model_name` (LessonInstance / Lesson / CalendarBlock -- duck-typed, no isinstance or import of the model classes) into a shared CalendarEvent shape (id/date/startTime/endTime/status) plus type-specific fields. `_compute_status` (PAD-96, documented in-code) computes status from the real END datetime-of-day, not just the calendar date, so a class that already ended earlier TODAY correctly reads 'completed' instead of staying 'scheduled'. For a LessonInstance it calls `effective_filled_spots`/`confirmed_spots` directly (the canonical fields); for a Lesson template it notes inline that enrolment IS the effective count (no presences exist for a template yet) and confirmedCount is hardcoded 0.

## Connections

Uses:
- (none within this scope)

Used by:
- (none within this scope)

Semantically related (not imports):
- backend/padel_app/models/lesson_instances.py: calls obj.effective_filled_spots / obj.confirmed_spots directly for a LessonInstance
- backend/padel_app/models/lessons.py: reads obj.players_relations/max_players/color/default_level_id/recurrence_rule for a Lesson template
- backend/padel_app/models/calendar_blocks.py: reads obj.type/recurrence_rule for a CalendarBlock
