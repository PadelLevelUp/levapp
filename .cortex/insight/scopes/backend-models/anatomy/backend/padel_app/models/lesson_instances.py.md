---
path: backend/padel_app/models/lesson_instances.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 3
size_lines: 175
size_tokens: 1520
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "15b19cdef90ea0f81f01e989d0afc2b79847df273e6b0f6a63f611a6aaf177b6"
---

## Purpose

LessonInstance is one concrete scheduled occurrence of a Lesson template -- its own datetime/status/level, and it can diverge from the parent Lesson via `overwrite_title`/`level_id` and the free-form `overridden_fields` text column (a serialized-JSON audit record of which fields were manually edited on this instance; the model stores it as raw text and does no parsing itself -- serializers/lesson.py owns that). Owns `presences` (one row per enrolled player, cascade delete-orphan) and the M2M `players_relations`/`coaches_relations`. `effective_filled_spots` and `confirmed_spots` are the two SINGLE-SOURCE-OF-TRUTH derived properties for 'how full is this class', documented in-code (PAD-71) as the values every other consumer (calendar payload, class-detail capacity, invitation-engine capacity checks) must call rather than recompute.

## Main players

- **LessonInstance** (lines 16-108, critical): the scheduled-occurrence entity: datetime, status, per-instance overrides, presences/enrolment relations.
- **effective_filled_spots** (lines 142-157, critical): canonical 'how full' count: enrolled minus declined (Presence.status == 'absent'), floored at 0. Single source of truth -- do not recompute elsewhere.
- **confirmed_spots** (lines 159-171, critical): canonical 'how many actively confirmed' count (Presence.status == 'present'); always <= effective_filled_spots.
- **title** (lines 134-136, supporting): overwrite_title falls back to the parent lesson.title.

## Insights

- `overridden_fields` is a raw Text column holding serialized JSON; the model itself performs no validation or parsing of it -- only serializers/lesson.py (`json.loads(obj.overridden_fields)`) interprets the contents, so a malformed value fails at serialization time, not at write time.
- `status` has four values (scheduled/canceled/rescheduled/completed) but the model implements no state-machine transitions or guards -- it is purely descriptive; whatever service sets this column is solely responsible for valid transitions.
- `notifications_enabled` defaults True independently at the instance level, separate from the parent Lesson's own `notifications_enabled` -- so notification suppression can be flipped for a single occurrence without touching the recurring template.

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/lessons.py: lesson relationship back_populates instances
- backend/padel_app/models/presences.py: presences back_populates lesson_instance, cascade delete-orphan
- backend/padel_app/models/Association_PlayerLessonInstance.py: players_relations back_populates lesson_instance
- backend/padel_app/models/Association_CoachLessonInstance.py: coaches_relations back_populates lesson_instance
- backend/padel_app/models/vacancy.py: lesson_instance_id FK (no back_populates)
- backend/padel_app/models/notification_event.py: lesson_instance_id FK (no back_populates)
- backend/padel_app/models/waiting_list_entry.py: lesson_instance_id FK (no back_populates)
- backend/padel_app/serializers/lesson.py: serialize_lesson_instance/serialize_class_instance read this model's attributes and overridden_fields JSON
- backend/padel_app/serializers/calendar_event.py: serialize_calendar_event calls effective_filled_spots/confirmed_spots directly

## Query pointers

- If you need 'how full is this class', call effective_filled_spots / confirmed_spots here -- do not recompute enrolled-minus-declined elsewhere (PAD-71).
- If you need to add an instance-level override, also read: serializers/lesson.py (overriddenFields serialization) and lessons.py (the parent template this instance can diverge from).
