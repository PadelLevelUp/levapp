---
path: backend/padel_app/tests/test_attendance_history_buckets.py
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 81
size_tokens: 762
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "a065e582c839ccb343907b8c2398b049a45b9fe9f297dda99bfbb545407f8252"
---

## Purpose

PAD-114 — pure-logic (no app/DB fixture) coverage of the bucketing/
granularity rules behind `attendance_history_service`, spec
`attendance.history`. `TestPickGranularity` pins the thresholds: <=31 days
is daily, up to ~18 months is monthly, longer is yearly (including
boundary cases like "a full month is still daily" and "just over a month
switches to monthly"). `TestBucketSeries` pins that buckets are contiguous
and gap-filled (empty periods still appear) for day/month/year
granularities, including a year-boundary rollover and a 28-day February.
`TestDefaultRange` pins that the default window is the current calendar
month, including a 28-day February.

## Connections

- Uses: `padel_app.services.attendance_history_service`
  (`_bucket_series`, `default_range`, `pick_granularity`) — imports a
  private (`_`-prefixed) function directly, treating the bucketing
  algorithm as a unit under test rather than only its public API.
- Used by: (none — leaf test file)
- Semantically related (not imports): covers the same service as
  `test_absence_history.py` (`build_absence_history` depends on this
  bucketing/granularity logic), but this file isolates the pure math with
  no DB while that one exercises it end-to-end through a seeded fixture.
