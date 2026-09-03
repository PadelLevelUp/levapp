---
path: backend/padel_app/tests/test_messaging_unread.py
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 103
size_tokens: 885
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "e785754758e9c62af73387eb8da1abc7bf2db7bdc7b5f3a45cab497fd1cc27bb"
---

## Purpose

PAD-66 — unread message count must clear when the recipient reads a
freshly-sent message. Bug: `create_message_service` stamped `sent_at`
with naive LOCAL time (`datetime.now()`) while
`mark_conversation_read_service` sets `last_read_at` in UTC
(`utcnow_naive()`), and unread is computed as `sent_at > last_read_at`.
Under a positive UTC offset, a just-sent message was stamped "in the
future" relative to UTC, so it stayed unread for up to ~1 hour after being
read. The test forces the PROCESS timezone to UTC+2 (no DST, via
`TZ=Etc/GMT-2` + `time.tzset()`) so the bug reproduces deterministically
regardless of the host/CI timezone: with local-time stamping the message
sits 2h ahead of UTC and never clears; with the UTC fix it clears
immediately. Pins the full round trip: send -> unread count is 1 -> mark
read -> unread count is 0.

## Connections

- Uses: `padel_app.services.messaging_service`
  (`create_message_service`, `get_unread_count`,
  `mark_conversation_read_service`, with `publish` monkeypatched to skip
  real Redis I/O); models `User`, `Conversation`, `ConversationParticipant`.
- Used by: (none — leaf test file)
- Semantically related (not imports): the naive-local-vs-UTC timestamp
  mismatch this file guards against is the same class of bug
  `test_dates.py` and `test_dashboard_pending_confirmations.py` guard
  against for calendar-day boundaries (PAD-144) — different fields, same
  "never mix naive-local and naive-UTC datetimes" lesson.
