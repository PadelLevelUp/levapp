---
path: backend/padel_app/modules/notifications_api.py
extracted_at: 2026-09-03T15:00:00Z
extraction_level: 2
size_lines: 131
size_tokens: 1037
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "846f89d0d582d6cd4449917d5e3b36f148dce9f3470545eeb5b46188c3d42798"
---

## Purpose

Client-facing notification-registration blueprint (`/api/notifications`), separate from `notification_engine_api.py`'s coach-facing config API. Two distinct channels: native Expo push (`POST/DELETE /device`, upserting/removing a `DeviceToken` row, with upsert-by-reassignment when a token is already claimed by another user — covers reinstalls and shared devices) and browser Web Push (`GET /vapid-public-key`, `POST /subscribe`, `POST /save-subscription`, `DELETE /unsubscribe`, storing a `PushSubscription` row per user). `subscribe_notifications` and `save_subscription` are byte-for-byte duplicate implementations under two different routes.

## Connections

- Uses: `padel_app.models` (`PushSubscription`, `DeviceToken`); `padel_app.sql_db.db`; reads `VAPID_PUBLIC_KEY` from the environment
- Used by: `padel_app/modules/__init__.py`: `register_blueprints` registers `notifications_api.bp`; called by the frontend/mobile clients when registering for push notifications
