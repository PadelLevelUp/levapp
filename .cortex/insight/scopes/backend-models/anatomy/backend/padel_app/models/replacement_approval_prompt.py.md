---
path: backend/padel_app/models/replacement_approval_prompt.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 97
size_tokens: 829
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "37d1f1bea1cfa2aefcae621fe224a6ebb059fd8967a2a42e2176cbb99abbff4b"
---

## Purpose

Semi-automatic-mode coach approval gate for a single Vacancy (unique vacancy_id -- one prompt per vacancy). `bundle_id` groups prompts created by one presence-confirmation call (its own docstring: a single prompt still gets its own bundle_id, keeping the API uniform). `queue_snapshot` (JSON) freezes the ordered invite-candidate queue at prompt-creation time. Its docstring states the prompt is persisted AS a Message in the coach's Assistant conversation (`message_id` FK) -- this table is metadata layered on top of a chat message, not the primary record of the interaction.

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/vacancy.py: vacancy_id FK, unique -- one prompt per vacancy
- backend/padel_app/models/messages.py: message_id FK -- the prompt IS persisted as this Message
- backend/padel_app/models/players.py: declined_player_id / waiting_list_player_id FKs
