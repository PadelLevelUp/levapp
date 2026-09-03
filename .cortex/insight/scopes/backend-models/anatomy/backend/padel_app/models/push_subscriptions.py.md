---
path: backend/padel_app/models/push_subscriptions.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 60
size_tokens: 506
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "54fc9f82cecb26b390a1a44d27973f2fc6b2dc229ab59c36fec9987f68ebf405"
---

## Purpose

PushSubscription is the browser Web-Push subscription, one per user (unique user_id) -- the pre-native-push sibling of device_token.py, contrasted in that file's own header comment. This file's header also carries an unrelated 'Audit findings (Phase 1)' comment block about the messaging/SSE stack (message-creation route, in-memory SSE queue tracking, auth stack, env loading) that has nothing to do with this file's own content -- likely a misplaced/copy-pasted note rather than a design decision about PushSubscription itself.

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/device_token.py: sibling push-registration model for the other channel; see that file's header comment for the contrast
