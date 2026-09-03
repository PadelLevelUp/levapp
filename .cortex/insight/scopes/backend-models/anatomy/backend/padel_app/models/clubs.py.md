---
path: backend/padel_app/models/clubs.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 120
size_tokens: 873
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "dbe72b5703193f4f05a572139e9f3c2271b7c1a7b0a2778b007ffbcf7cd9a445"
---

## Purpose

Club is the top of the coach/player/lesson hierarchy at a physical-venue level. Owns `coaches_relations`/`players_relations` (many-to-many via the Association_*Club junctions) and a one-to-many `lessons` with cascade='all, delete-orphan' -- deleting a Club cascades to delete every Lesson (and, transitively, every LessonInstance) that belongs to it. `coaches`/`players` properties unwrap the junction rows to plain lists; logo is an optional Image FK.

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/Association_CoachClub.py: back_populates club
- backend/padel_app/models/Association_PlayerClub.py: back_populates club
- backend/padel_app/models/lessons.py: Lesson.club/club_id FK + relationship back_populates lessons
