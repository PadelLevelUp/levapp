---
path: backend/padel_app/tests/test_native_push.py
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 447
size_tokens: 4466
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "a70007b78d09465c863bcb93a92882737ba40366d79ca3cf50816c7e4bad97ec"
---

## Purpose

Phase 5 — native push notification support: `DeviceToken` storage +
registration endpoint, the Expo push sender (`utils.expo_push`), and its
wiring into both delivery paths (class reminders, direct messages), plus
PAD-153/PAD-147 badge-count correctness. `POST /api/notifications/device`
creates a row; re-registering the SAME token for a DIFFERENT user
reassigns it (no duplicate row — one token, one owner); `DELETE
/api/notifications/device` removes the caller's own token and is
idempotent (200 even for an already-deleted or never-existed token), and
critically only removes the CALLER's own token — another user's token
with the same value in the DB is untouched (200 no-op) rather than
deletable by anyone who knows it. `send_expo_push` builds the exact Expo
request body shape (`to`/`title`/`body`/`data` per token); on a
`DeviceNotRegistered` error for one token it deletes that `DeviceToken`
row while leaving others intact (stale-token cleanup); it never raises on
an HTTP/network failure, returning `False` instead;
`send_expo_push_to_user` is a no-op (`False`, no request sent) when the
user has no registered token. Delivery-path wiring:
`send_class_reminders` calls the Expo sender with
`{"type": "class", "classInstanceId": ...}` for a player with a
registered token; `create_message_service` calls it with
`{"type": "message", "conversationId": ...}` for the recipient (both
verified via `patch` on the sender function, not real HTTP). PAD-153/
PAD-147 badge tests: `badge` is included in the Expo payload only when
explicitly provided (omitted entirely when `None`, so the device icon is
left untouched — the correct behavior for non-message notifications);
`badge=0` survives (0 is a real "clear the icon" value, not falsy-means-
absent); and a direct-message push carries the RECIPIENT's real unread
total as the badge, incrementing correctly across two unread messages
sent in sequence (`create_message_service` commits before the push loop
runs, so the second push's badge reflects both).

## Connections

- Uses: models `DeviceToken`, `User`, `Coach`, `Player`, `CoachLevel`,
  `Club`, `Lesson`, `LessonInstance`, `Association_CoachLessonInstance`,
  `Association_PlayerLessonInstance`, `NotificationConfig`,
  `Conversation`, `ConversationParticipant`;
  `padel_app.utils.expo_push` (`send_expo_push`,
  `send_expo_push_to_user` — the module under test, with
  `requests.post` mocked); `padel_app.services.notification_service`
  (`send_class_reminders`); `padel_app.services.messaging_service`
  (`create_message_service`); `flask_jwt_extended.create_access_token`.
- Used by: (none — leaf test file)
- Semantically related (not imports): the JWT-scoped "only the owner can
  mutate their own row" pattern for `DeviceToken` deletion echoes
  `test_account_deletion.py`'s JWT-blocklist-after-mutation tests and the
  ownership checks in `test_frontend_api_authz.py`.
