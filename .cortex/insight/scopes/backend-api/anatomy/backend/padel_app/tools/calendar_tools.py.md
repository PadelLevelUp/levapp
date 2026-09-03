---
path: backend/padel_app/tools/calendar_tools.py
extracted_at: 2026-09-03T15:00:00Z
extraction_level: 2
size_lines: 99
size_tokens: 545
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "84187ec21d7c8b17031a44501e5101781a1311b2baeebc13918922869a7abdfe"
---

## Purpose

Recurrence-expansion utilities built on `dateutil.rrule`: `ensure_utc` normalizes a naive datetime/date to UTC-aware (dates get combined with `time.max`, i.e. end-of-day); `build_rrule` parses a JSON `recurrence_rule` string (`{"frequency": "weekly", "daysOfWeek": [...]}`) into a `dateutil.rrule.rrule`, mapping day-of-week integers through `WEEKDAY_MAP` where `0` means Sunday (matching JS/frontend day-of-week convention) rather than `dateutil`'s own Monday-first `MO`/`TU`/... constants; `expand_occurrences` is the main entry point, returning every occurrence datetime of a (possibly recurring) lesson that falls within `[range_start, range_end]`; `build_datetime`/`_format_date`/`_format_time` are small display-string formatters.

## Connections

- Uses: `dateutil.rrule` (`rrule`, `WEEKLY`, weekday constants); stdlib `json`, `datetime`
- Used by: `padel_app/helpers/calendar_helpers.py`: `expand_occurrences` is the core primitive behind every lesson/block occurrence expansion feeding the calendar and dashboard
