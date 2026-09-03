---
path: backend/padel_app/tests/test_dashboard_pending_confirmations.py
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 197
size_tokens: 1946
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "01a74e59542e41cff1a48bf288d012bd9bbeb48115005ca46217bd6a146aae67"
---

## Purpose

PAD-78 (pending-confirmations count + manual-notify targeting) and PAD-144
("tomorrow" is the next CLUB-LOCAL calendar day). A student is "pending
confirmation" for a tomorrow class when they have a `NotificationEvent`
still `sent` (neither `confirmed` nor `expired`). Pins:
`count_pending_confirmations` counts only tomorrow's `sent` events (not
today's, not confirmed/expired ones); `get_pending_confirmation_targets`
groups pending player ids by instance; `notify_pending_confirmations`
calls `send_manual_notifications` only for the pending targets, returning
`{instances, sent}` counts (verified via `monkeypatch` on
`notification_service.send_manual_notifications`, not a real send). The
PAD-144 section pins `_tomorrow_window`'s DST-aware local-day boundary:
in winter (WET, UTC+0) local and UTC midnight coincide; in summer (WEST,
UTC+1) local midnight is 23:00 UTC the prior day; and critically, an
instant already past UTC midnight but still before LOCAL midnight (23:30
UTC in summer = 00:30 local) must resolve "tomorrow" as the day AFTER the
naive-UTC answer — a naive-UTC window would nudge the wrong students. Also
pins the window stays naive (`tzinfo is None`), half-open, and always
exactly one calendar day wide on both sides of DST.

## Connections

- Uses: `padel_app.helpers.dashboard.pending`
  (`count_pending_confirmations`, `get_pending_confirmation_targets`,
  `notify_pending_confirmations`, `_tomorrow_window`);
  `padel_app.services.notification_service` (monkeypatched
  `send_manual_notifications`); models `User`, `LessonInstance`,
  `NotificationEvent`, `Coach`, `Player`, `Club`, `Lesson`,
  `Association_CoachClub`.
- Used by: (none — leaf test file)
- Semantically related (not imports): the club-local-day DST handling in
  `_tomorrow_window` mirrors the same concern in `test_dates.py`'s
  `club_day_start` tests — both guard against a naive-UTC boundary nudging
  the wrong calendar day across DST.
