---
path: backend/padel_app/services/account_service.py
extracted_at: 2026-09-03T13:58:46Z
extraction_level: 2
size_lines: 37
size_tokens: 337
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "81ceab10521a025993a0a800fe31687c40540f27bdcb8e2e6747c11e82dcbad0"
---

## Purpose

Implements in-app account deletion for Apple App Store guideline
5.1.1(v): `delete_account_service` soft-deletes and anonymizes a `User`
row rather than hard-deleting it, so foreign keys from `Message.sender_id`
still resolve and a deleted user's chat history survives (shown under the
"Deleted user" sentinel name). Session kill across devices is handled
elsewhere, by the JWT blocklist loader in `padel_app/auth.py`, which
rejects tokens for any user whose `status` is `"disabled"`.

## Connections

- Uses: `padel_app/models` (`User`) — the row being anonymized; `padel_app/sql_db` (`db`) — commits the change.
- Used by: the account-deletion route (outside this scope, in the API layer).
