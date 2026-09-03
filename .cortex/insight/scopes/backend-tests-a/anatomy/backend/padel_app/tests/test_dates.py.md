---
path: backend/padel_app/tests/test_dates.py
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 125
size_tokens: 1260
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "ea6b23a1ba25a11a6ff629d1204faf461a43fb98a46fe550a76080868ced7f88"
---

## Purpose

Pure unit tests for `padel_app.utils.dates`, no app/DB fixture. PAD-33:
`to_utc_iso` must always emit a UTC-aware ISO 8601 string (naive input is
assumed UTC and gets a `+00:00` suffix; aware input is converted; `None`
in -> `None` out) — regression for chat timestamps rendering 1 hour behind
local time. PAD-144: `club_day_start_utc` computes the CLUB-LOCAL
(Europe/Lisbon) calendar-day boundary and converts it back to naive UTC,
since every DB instant is naive UTC but a coach's "day" is local. The
decisive test (`test_same_utc_instant_lands_on_different_local_days_in_summer_and_winter`)
proves a REAL DST-aware conversion happens (not a constant offset or a
no-op `.replace(hour=0)`) by showing the identical UTC wall-clock time
(23:30) yields different boundaries in summer (WEST, UTC+1: boundary 30
min before the instant, already the next local day) vs winter (WET,
UTC+0: boundary same local day). Also pins that `days_offset` walks
CALENDAR days (not 24-hour blocks) and stays correct across the WET->WEST
spring-forward transition, and the result is always naive (`tzinfo is
None`) for DB comparison.

## Connections

- Uses: `padel_app.utils.dates` (`to_utc_iso`, `club_day_start_utc`) —
  imported inside each test function, no module-level import.
- Used by: (none — leaf test file)
- Semantically related (not imports): `club_day_start_utc` is the same
  DST-aware local-day primitive `test_dashboard_pending_confirmations.py`'s
  `_tomorrow_window` builds on (both PAD-144); the fail-closed-to-UTC
  discipline pattern (real conversion, not a naive shortcut) recurs there.
