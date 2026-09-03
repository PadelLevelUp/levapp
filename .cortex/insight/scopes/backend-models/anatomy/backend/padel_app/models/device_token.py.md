---
path: backend/padel_app/models/device_token.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 61
size_tokens: 526
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d66d0f3654a10420d36f0c8dc84fbcc29a65cd2c4657778a9fcb69cb5611a6a6"
---

## Purpose

Native push device-token storage (iOS/Android), the Phase-5 sibling of push_subscriptions.py's browser Web-Push model. Unlike PushSubscription (unique per user_id, one browser sub per user), a DeviceToken is unique per *token* -- a user can hold several (multiple phones/reinstalls), and re-registering an existing token reassigns it to the new caller; that upsert logic lives in the route layer, not here (per the file's own header comment).

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/push_subscriptions.py: sibling model for the other push channel; mirrors its shape (user relationship, Model mixin) but different uniqueness rule
