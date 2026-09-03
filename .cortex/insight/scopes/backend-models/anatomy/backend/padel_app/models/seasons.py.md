---
path: backend/padel_app/models/seasons.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 81
size_tokens: 620
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d1c0f7ea0b264bbc4a3747e2cb44a01554cdce7f08e5d64aa5e983e46e18413d"
---

## Purpose

Season is a coach-defined date range (name, start_date, end_date), used to bound `Lesson.recurs_until_season_end`. `frontend_dict()` returns its camelCase API shape directly (mirrored by serializers/season.py, which is a one-line passthrough to this method).

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/coaches.py: Coach.seasons back_populates coach, cascade delete-orphan
- backend/padel_app/serializers/season.py: serialize_season(season) is a one-line call to season.frontend_dict()
