---
path: backend/padel_app/serializers/lesson.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 3
size_lines: 257
size_tokens: 2384
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "3ba4f942c01f5a0f7b7325837d19f1987b50512934ef52fd1a5e15c88c640ba6"
---

## Purpose

The richest serializer in this scope: `serialize_lesson`/`serialize_lesson_instance` map the two schedule entities to their API shapes (parsing recurrence_rule JSON text defensively, same pattern as serializers/calendar.py), and `serialize_class_instance` builds the full ClassInstance payload -- participants, presences, the deduplicated invitation log, planned exercises, and the PAD-43/PAD-73 cancellation-deadline / proactive-decline-window fields -- with role-based visibility (PAD-36): a coach (viewer_player_id is None) sees everyone's data; a student (viewer_player_id set) only ever sees their OWN participants/presences/invitations entries.

## Main players

- **_invitation_precedence** (lines 18-28, supporting): sort key ranking a NotificationEvent's meaningfulness (confirmed > expired > sent > queued), then round_number, then id.
- **dedupe_invitation_events** (lines 31-49, critical): collapses NotificationEvents to at most one per student (PAD-72), keeping first-seen order but the most meaningful record per player.
- **serialize_lesson** (lines 52-70, critical): Lesson template -> API shape, including defensive recurrence_rule JSON parsing.
- **serialize_lesson_instance** (lines 73-89, supporting): LessonInstance -> the plain lesson-instance API shape (not the richer ClassInstance shape).
- **serialize_class_instance** (lines 92-232, critical): the full ClassInstance payload for Lesson or LessonInstance, with PAD-36 role-based (coach vs student) visibility filtering.

## Insights

- `serialize_class_instance` performs three function-local imports (notification_event, lesson_instance_training, notification_config, and notification_service) specifically to avoid a module-level import cycle -- notification_service itself imports serializers, so a top-level import here would be circular. Any refactor that moves this logic to module scope must first break that cycle.
- Role-based visibility (PAD-36) is enforced ad hoc per list comprehension (`if not is_student or rel.player_id == viewer_player_id`) repeated three times (participants, presences, invitations) rather than through one shared filter helper -- adding a fourth student-visible collection means remembering to repeat the same guard.

## Connections

Uses:
- backend/padel_app/serializers/player.py: serialize_player builds each participants entry
- backend/padel_app/serializers/presence.py: serialize_presence builds each presences entry
- backend/padel_app/models/notification_event.py: function-local import; queried and deduped for the invitations log
- backend/padel_app/models/lesson_instance_training.py: function-local import; queried for plannedExerciseIds
- backend/padel_app/models/notification_config.py: function-local import; queried for the cancellation-deadline hours and (via notification_service, out of scope) the proactive-decline window

Used by:
- (none within this scope)

Semantically related (not imports):
- backend/padel_app/models/lesson_instances.py: reads LessonInstance attributes and overridden_fields JSON; is_instance branch
- backend/padel_app/models/lessons.py: reads Lesson attributes when obj is a template, not an instance

## Query pointers

- If you need to change what a STUDENT can see on their own class detail, search this file for `is_student`/`viewer_player_id` -- the guard is repeated per field, not centralized.
- If you need to change invitation-log dedup, read _invitation_precedence first (PAD-72) -- it defines which of several NotificationEvent rows for one student 'wins'.
- If you need the cancellation/proactive-decline deadlines, read first: notification_config.py (get_cancellation_deadline_hours), then: the out-of-scope notification_service.proactive_decline_deadline / proactive_decline_window_is_open, which this file calls but does not define.
