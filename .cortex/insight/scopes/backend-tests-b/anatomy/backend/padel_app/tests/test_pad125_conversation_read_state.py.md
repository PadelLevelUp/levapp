---
path: backend/padel_app/tests/test_pad125_conversation_read_state.py
extracted_at: 2026-09-03T13:59:54Z
extraction_level: 2
size_lines: 265
size_tokens: 2450
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "437a2c9d71e726818ac35960d5ecdc32e1cf422563f5d2d2260f4ae45c8e661f"
---

## Purpose

PAD-125 regression tests for `Conversation.last_read_by()`, which compared `ConversationParticipant.id` (the join row's own primary key) against the caller's `user_id` instead of `ConversationParticipant.user_id` — messaging.read-tracking rule 3. Both tests deliberately force the two id sequences apart via an explicit `id` override on `ConversationParticipant` (or a raw-SQL PK swap in the sharper case) and assert that divergence up front (`_assert_ids_diverge`) as a **vacuity guard**: under a naive seed where `participant.id == user_id` by coincidence, the bug is invisible and these tests would pass against unfixed code. `test_each_participant_sees_their_own_read_state` is the sharpest case — it swaps the two participants' join-row PKs onto each other's user id via raw `UPDATE` statements, so the buggy lookup would resolve each caller to the *other* participant's read cursor; asserts via `GET /api/app/conversation/{id}` that each caller's `isRead`/`status` fields reflect their own `last_read_at`, not the other's.

## Connections

- Uses: `padel_app.models.User`, `padel_app.models.Message`, `padel_app.models.conversations.Conversation` (`build_participant_key`, `.participants`), `padel_app.models.conversation_participants.ConversationParticipant`, `padel_app.sql_db.db` (including raw `db.text()` UPDATE statements to swap participant-row primary keys); `flask_jwt_extended.create_access_token` for the authenticated `GET /api/app/conversation/{id}`; the `app` and `client` fixtures from `conftest.py` (scope `backend-tests-a`).
- Used by: —
- Semantically related (not imports): none identified.
