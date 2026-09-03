---
path: backend/padel_app/models/coach_levels.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 84
size_tokens: 596
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "97b698443606fdd3fc659b65a040406e64cf35a1fd2a3eb5f99c38baf4e45ca3"
---

## Purpose

CoachLevel is a per-coach custom skill-level taxonomy (label, code, display_order) -- NOT a global ladder; each coach defines their own (e.g. "A1", "Beginner", "Pro"). Backs the level a coach assigns a player (Association_CoachPlayer.level_id), a Lesson/LessonInstance's default_level_id/level_id, and player_level_history rows.

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/coaches.py: Coach.levels back_populates coach
- backend/padel_app/models/Association_CoachPlayer.py: level_id FK + relationship back_populates coach_player_relations
- backend/padel_app/models/lessons.py: Lesson.default_level_id FK (no back_populates)
- backend/padel_app/models/lesson_instances.py: LessonInstance.level_id FK (no back_populates)
- backend/padel_app/models/player_level_history.py: level_id FK + relationship (no back_populates)
