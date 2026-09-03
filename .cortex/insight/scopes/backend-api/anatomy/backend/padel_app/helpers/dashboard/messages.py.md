---
path: backend/padel_app/helpers/dashboard/messages.py
extracted_at: 2026-09-03T15:00:00Z
extraction_level: 2
size_lines: 67
size_tokens: 494
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "5fe8d388f81ad48594a14d6ffd55ee6ff35da747f4bc79786713fc0d4df2db51"
---

## Purpose

`compute_message_overview` computes the messaging summary shown on both coach and player dashboards: total unread message count, number of distinct conversations with unread messages, and the single most recent message (sender name + preview text) across all the user's conversations. Unread is defined relative to `ConversationParticipant.last_read_at`, defaulting to the Unix epoch when a participant has never read.

## Connections

- Uses: `padel_app/sql_db.py` (`db`); `padel_app.models` (`ConversationParticipant`, `Message`, `User`); `sqlalchemy.func` for count/distinct/coalesce
- Used by: `padel_app/helpers/dashboard_services.py`: `build_dashboard_payload` calls this once, ahead of the role-specific blocks, to populate the shared "messages" block on every dashboard
