---
path: backend/padel_app/utils/dates.py
extracted_at: 2026-09-03T13:58:46Z
extraction_level: 2
size_lines: 73
size_tokens: 841
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "f00e82ac425133c0c881300e8ff2190dcfe2e2d7af0c0ce34c7f5960b666b4d3"
---

## Purpose

The single shared source of truth for the codebase's naive-UTC storage
convention. Defines `CLUB_TZ` (`ZoneInfo("Europe/Lisbon")`, the wall
clock every human-facing "day"/"hour"/"week" is read off), `utcnow_naive()`
(a DST-safe replacement for the deprecated `datetime.utcnow()`),
`to_utc_iso()` (serializes a naive-UTC datetime as a UTC-aware ISO string
so browser `new Date(...)` parses it correctly instead of misreading it
as local time), and `club_day_start_utc()` (converts a naive-UTC instant
to the naive-UTC instant of club-local midnight, walking calendar days
rather than 24h blocks so DST transitions land on real local midnight).

## Connections

- Uses: nothing from the app (`from typing import Optional`,
  `zoneinfo.ZoneInfo`, stdlib only) — deliberately, to avoid any risk of
  circular imports.
- Used by: `scheduler.py` (`CLUB_TZ`, `utcnow_naive`), `notification_service.py`
  (`CLUB_TZ`, `club_day_start_utc`, `to_utc_iso`, `utcnow_naive`),
  `student_availability_service.py` (`CLUB_TZ`), `messaging_service.py`
  (`utcnow_naive`), `replacement_approval_service.py` (`utcnow_naive`),
  `import_service.py` (`utcnow_naive`), `notification_preview.py`
  (`utcnow_naive`), `season_service.py` (`utcnow_naive`, via lazy import).

## Insights

- PAD-144: `CLUB_TZ` previously existed as three separate, drift-prone
  copies (in `scheduler`, `student_availability_service`, and a lazy
  import inside `notification_service`). This module is now the ONE
  place it is defined; any new call site should import it from here, not
  reinvent it.
- `club_day_start_utc`'s docstring calls out the exact bug class this
  module prevents: naively doing `.replace(hour=0, ...)` on a naive-UTC
  instant pins "midnight" to UTC midnight, which is 01:00 Lisbon local
  time during WEST (summer, UTC+1) and correct only in WET (winter,
  UTC+0) — producing bugs that look intermittent because they only
  reproduce half the year.
- `to_utc_iso`'s docstring documents the client-side consequence of
  skipping it: a naive `.isoformat()` string with no offset is
  interpreted by JS `new Date(...)` as LOCAL time, so a naive-UTC
  timestamp displays an hour behind in Lisbon summer time unless this
  helper attaches the UTC offset first.
