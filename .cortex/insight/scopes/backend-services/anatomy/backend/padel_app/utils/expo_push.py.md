---
path: backend/padel_app/utils/expo_push.py
extracted_at: 2026-09-03T13:58:46Z
extraction_level: 2
size_lines: 130
size_tokens: 1201
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "549b12c7866998ce584abf54503531169c6e330050c65c61fa08dfe30ce676d7"
---

## Purpose

Native (Expo/iOS) push sender, posting directly to Expo's raw HTTP push
API (`https://exp.host/--/api/v2/push/send`) via `requests` rather than
the `exponent_server_sdk` package (not a project dependency). Batches
tokens in groups of 100 (Expo's documented limit), parses receipts for
`DeviceNotRegistered` errors and deletes the corresponding stale
`DeviceToken` row, and is best-effort throughout — every failure is
logged and swallowed, never raised to the caller.

## Connections

- Uses: `padel_app.models.DeviceToken`; `padel_app.sql_db.db`; `requests`
  (third-party, transitive dependency).
- Used by: `services/messaging_service.py` (`send_expo_push_to_user` —
  new-message push with the recipient's live unread count as the iOS
  badge).

## Insights

- `badge` is OMITTED from the Expo payload entirely when `None`, rather
  than defaulting to 0 — the docstring explicitly warns that passing 0
  to mean "unknown" would incorrectly CLEAR the device's badge. A caller
  that doesn't own an authoritative unread count must not pass a literal
  0.
- `DeviceNotRegistered` cleanup logs at WARNING, not INFO, with an
  explicit comment explaining why: the app configures no logging setup,
  so the root logger sits at its default WARNING level and INFO-level
  messages never reach stderr — losing a device token silently is what
  made an earlier "no push arrived" bug (PAD-118) undiagnosable.
- Mirrors `push_notifications.py`'s style deliberately (best-effort,
  logs-and-swallows) so the two push channels (web push, Expo native)
  can be called side by side with identical failure semantics.
