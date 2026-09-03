---
path: backend/padel_app/models/standing_waiting_list_entry.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 36
size_tokens: 288
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "e995ce8154e1d829d13648eaa6a54a93cf8daf0f88095c1e38afdc8e502da659"
---

## Purpose

A player's ongoing/subscription-style waitlist credit pool (credits_total/credits_used, expires_at, is_active) -- distinct from the per-class waiting_list_entry.py, whose `standing_entry_id` optionally links a specific class join back to the standing credit pool it drew from.

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/waiting_list_entry.py: standing_entry_id FK points back to this table for standing-credit-sourced waitlist joins
