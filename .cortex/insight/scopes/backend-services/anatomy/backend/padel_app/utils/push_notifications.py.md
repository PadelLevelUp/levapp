---
path: backend/padel_app/utils/push_notifications.py
extracted_at: 2026-09-03T13:58:46Z
extraction_level: 2
size_lines: 62
size_tokens: 552
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "52eadffd972331bf5a040b7093b493191b7c3d4477a583dea8368ca2a8ff1ed1"
---

## Purpose

Web-push (VAPID) sender: `send_push_notification` looks up the user's
`PushSubscription`, sends via `pywebpush.webpush`, and on a
404/410 (subscription gone) deletes the stale row. Requires
`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_CLAIMS_EMAIL` env vars —
logs a warning and no-ops if any are missing rather than raising.
Best-effort throughout: every path returns a bool, nothing propagates
as an exception to the caller.

## Connections

- Uses: `padel_app.models.PushSubscription`; `padel_app.sql_db.db`;
  `pywebpush` (`webpush`, `WebPushException`, third-party).
- Used by: `services/messaging_service.py` (new-message push),
  `services/replacement_approval_service.py` (approval-request push to
  the coach); `services/notification_service.py` likely calls this too
  (imported there per its L1 import list, not re-verified in this
  file).

## Insights

- Only a single web-push subscription per user is supported
  (`PushSubscription.query.filter_by(user_id=user_id).first()`) — a
  user with multiple browser tabs/devices subscribed only ever gets
  pushed through whichever subscription row this query happens to
  return, unlike `expo_push.py`'s native-push sibling which fans out to
  ALL of a user's `DeviceToken` rows.
- Only 404/410 responses trigger subscription cleanup; any other
  `WebPushException` (e.g. a transient 5xx) is logged and left in place
  for the next send attempt to retry naturally.
