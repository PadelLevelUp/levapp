---
path: backend/padel_app/tests/test_calendar_event_status.py
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 148
size_tokens: 1234
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "f3f5f00efb056ae9afea5c9c4b7423bee0b97974207f1c78d54050c918e016b4"
---

## Purpose

PAD-96 — pins that `_compute_status` (spec `calendar.view` rule 11) reads
a calendar event as `completed` once its END datetime has passed, not
merely once its DATE is in the past. Regression: previously `_compute_status`
compared only the event date to `today()`, so a class earlier the same day
(15:00-16:00 checked at 20:30) incorrectly stayed `scheduled`. Covers:
today-ended -> completed, today-not-yet-ended -> scheduled, today-in-progress
-> scheduled, previous-day -> completed, future-day -> scheduled, and the
same matrix for a recurring occurrence via `override_date` (template
start/end time-of-day combined with the occurrence day). A DB-backed test
(`test_serialize_threads_now_for_today_ended_instance`) confirms
`serialize_calendar_event` threads the injected `now=` through end-to-end
against a real `LessonInstance`.

## Connections

- Uses: `padel_app.serializers.calendar_event` (`_compute_status`,
  `serialize_calendar_event`); models `User`, `Coach`, `Club`, `Lesson`,
  `LessonInstance` for the one DB-backed test.
- Used by: (none — leaf test file)
- Semantically related (not imports): shares the "now must be injectable,
  never wall-clock" convention with `test_dates.py` and
  `test_dashboard_pending_confirmations.py`'s timezone-window tests.
