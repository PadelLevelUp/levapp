---
path: backend/padel_app/tests/test_account_deletion.py
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 175
size_tokens: 1406
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d54213a52826fb23019e088609315c45624a01e662ce50c2906c9f194abb49a5"
---

## Purpose

Apple guideline 5.1.1(v) compliance — `DELETE /api/auth/me` self-deletion.
Pins that the endpoint soft-deletes and anonymizes the calling user
(`status -> "disabled"`, name replaced with "Deleted user", email/phone/
generated_code/user_image_id cleared) while keeping the row so other
users' message authorship still resolves; that a JWT issued before
deletion is rejected (401/422) on every subsequent request — a full
session kill, not just a client-side logout; that the deleted user
disappears from `GET /api/app/users`; that a message the deleted user
authored still serializes correctly with the anonymized sender name and
its original `senderId`; and that another user's token and account are
completely unaffected by someone else's deletion.

## Connections

- Uses: `padel_app.models` (`User`, `Conversation`,
  `ConversationParticipant`, `Message`) for fixture seeding and the
  cross-user-message test; `padel_app.serializers.message`
  (`serialize_message`) to verify serialization survives anonymization;
  `flask_jwt_extended.create_access_token` to mint bearer tokens directly
  (bypassing the login endpoint); `padel_app.sql_db.db`.
- Used by: (none — leaf test file)
- Semantically related (not imports): the JWT-rejection-after-mutation
  pattern here (blocklist loader in `padel_app/auth.py`) is conceptually
  related to `test_native_push.py`'s token lifecycle tests
  (`test_delete_device_token_*`), though that file deletes push tokens
  rather than JWTs.
