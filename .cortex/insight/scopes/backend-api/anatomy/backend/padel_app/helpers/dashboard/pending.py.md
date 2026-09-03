---
path: backend/padel_app/helpers/dashboard/pending.py
extracted_at: 2026-09-03T15:00:00Z
extraction_level: 2
size_lines: 95
size_tokens: 970
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "a43ef6b2ddf958626eccd8a3fc4b553af98a5ba9413da46e46b5fd91b059ac89"
---

## Purpose

Tracks and re-nudges students who haven't confirmed for tomorrow's classes. `_tomorrow_window` computes the club-local "tomorrow" as a half-open naive-UTC range (fixed under PAD-144 after a DST bug shifted which classes counted); `_pending_pairs` finds distinct (lesson_instance, player) pairs still in `NotificationEvent.status == "sent"` within that window; `count_pending_confirmations` and `get_pending_confirmation_targets` expose read views over that set, and `notify_pending_confirmations` sends an extra manual nudge to every pending student via the notification engine, without changing the pending count itself.

## Connections

- Uses: `padel_app/sql_db.py` (`db`); `padel_app.models` (`NotificationEvent`, `LessonInstance`); `padel_app.utils.dates` (`club_day_start_utc`, `utcnow_naive`) for the DST-safe window; lazily imports `padel_app.services.notification_service.send_manual_notifications` inside `notify_pending_confirmations` to avoid a module-level import cycle
- Used by: `padel_app/modules/frontend_api.py`: `notify_pending_confirmations_route` (~line 2044) calls `notify_pending_confirmations` to power the coach's manual "notify pending" action
