---
path: backend/padel_app/models/lessons.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 168
size_tokens: 1506
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "27238ab0d6e8af29a9cd098a2ec5e6efcc3a266a3620b83c532a6c6a60070f55"
---

## Purpose

Lesson is the recurring/template class definition (recurrence_rule stored as raw JSON text, recurrence_end, recurs_until_season_end). `data_for_instance()` (aliased by `to_instance_data()`, which is a pure wrapper -- two names for one method) builds the seed dict used to materialize a new LessonInstance from this template: title, level, max_players, status forced to 'scheduled', and player_ids/coach_ids copied from the current M2M relations. Owns `instances` (1:many LessonInstance, cascade delete-orphan) and the M2M players_relations/coaches_relations.

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/clubs.py: club relationship back_populates lessons
- backend/padel_app/models/Association_CoachLesson.py: coaches_relations back_populates lesson
- backend/padel_app/models/Association_PlayerLesson.py: players_relations back_populates lesson; data_for_instance() reads it for player_ids
- backend/padel_app/models/lesson_instances.py: instances back_populates lesson, cascade delete-orphan
- backend/padel_app/models/coach_levels.py: default_level_id FK (no back_populates)
