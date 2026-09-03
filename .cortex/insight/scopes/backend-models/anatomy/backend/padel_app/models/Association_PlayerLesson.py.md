---
path: backend/padel_app/models/Association_PlayerLesson.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 72
size_tokens: 551
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "10aa46d103cb9ba9fd35199bbfefebe457febb3855a8529bef3123de2c35b64e"
---

## Purpose

Junction linking a Player to a Lesson template (recurring-class enrolment, before any concrete occurrence exists). `Lesson.data_for_instance()` reads this collection's player ids to seed a new LessonInstance's roster.

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/lessons.py: Lesson.players_relations back_populates this class; data_for_instance() reads it to seed player_ids
- backend/padel_app/models/players.py: Player.lessons_relations back_populates this class
