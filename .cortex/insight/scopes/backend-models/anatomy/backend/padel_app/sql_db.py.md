---
path: backend/padel_app/sql_db.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 11
size_tokens: 46
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "2d0900692eee5689fcd7f50dbc5009e077cb17ff5ef467da7c68d98a4f104963"
---

## Purpose

Declares the shared `db` (Flask-SQLAlchemy) and `migrate` (Flask-Migrate) instances and `init_db(app)`, which wires both into the Flask app. Every model file in this scope, and model.py's Image/Imageable, declare their tables against this single `db.Model`/`db.session`.

## Connections

Uses:
- (none within this scope)

Used by:
- backend/padel_app/model.py: db.Model base class for Image/Imageable, and db.session throughout the Model mixin
- (every models/*.py file in this scope): each does its own `from padel_app.sql_db import db` for db.Model / db.session -- see each file's own Uses list
