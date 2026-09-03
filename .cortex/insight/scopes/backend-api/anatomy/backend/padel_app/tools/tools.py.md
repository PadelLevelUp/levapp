---
path: backend/padel_app/tools/tools.py
extracted_at: 2026-09-03T15:00:00Z
extraction_level: 3
size_lines: 231
size_tokens: 1755
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "390d17547cde6badfd8ef1c802502ada51dc2d347e5c0d18cf03fc5b6d4ab034"
---

## Purpose

Grab-bag of low-level utilities reused across the legacy editor, dashboard, and calendar surfaces: generic per-model CSV export/import (`create_csv_for_model`, `upload_csv_to_model`, working through each model's own `get_dict`/`update_with_dict`), a lenient string→typed-value converter used by CSV import (`try_convert`, `str_to_bool`, `str_to_date`, `str_to_datetime` — each tries a list of formats and falls through), a text-table renderer (`dict_to_table`), a request date-range parser for dashboard/calendar endpoints (`_parse_range_or_default`), and small formatting/coercion helpers (`_date_label`, `_safe_int`, `iso_date`).

## Main players

- `create_csv_for_model(model)` / `upload_csv_to_model(model)` (lines 50-101) — critical. Round-trip a model's full table to/from a CSV file under `static/data/csv/<model_name>.csv`; import matches existing rows by `name` (falling back to `id`) and either updates or creates. `upload_csv_to_model` skips hybrid properties (via `get_hybrid_properties`) since those aren't real columns.
- `try_convert(value)` / `str_to_bool` / `str_to_date` / `str_to_datetime` (lines 112-184) — critical. Best-effort typed parsing for CSV import: tries `int`, `float`, bool, date, then datetime in that order, each against a hardcoded list of accepted formats, returning the raw string if nothing matches.
- `_parse_range_or_default()` (lines 193-212) — critical. Reads `?from=`/`?to=` query params as ISO datetimes (converted to UTC), defaulting to `[now, now+30 days]` when either is missing. This is the shared date-range contract for dashboard/calendar list endpoints.
- `_date_label` / `_safe_int` / `iso_date` (lines 215-229) — supporting. `_date_label` formats an ISO date string as e.g. "Mon 2 Mar"; the docstring flags that `%a`/`%b` depend on server locale. `_safe_int` is a defensive `int()` with a default on any exception.

## Insights

- `_parse_range_or_default`'s default-range branch (lines 200-207) contains three literal no-op lines computing `range_end` via subtracting two identical `datetime.now()`/`utcnow()` calls (always zero), each immediately overwritten by the next line, before the actual `timedelta(days=30)` computation on line 207 — dead code left in place rather than cleaned up; harmless but confusing to a reader expecting those lines to matter.
- `_date_label`'s locale dependency on `%a`/`%b` means the "Mon 2 Mar" format silently becomes non-English if the server process's locale is ever changed — it is not driven by the app's own `pt`/`en` i18n system (`BABEL_DEFAULT_LOCALE`), so a locale mismatch here would not follow user-facing language switches.
- `try_convert`'s format list treats a bare `"2023-01-01"` (date-only, no time) as valid input to `str_to_datetime` (format `"%Y-%m-%d"` is in that list too) — so CSV cells with dates but no times silently become midnight `datetime`s rather than being rejected or routed to `str_to_date`.

## Connections

- Uses: stdlib (`csv`, `os`, `datetime`, `date`, `timezone`); `dateutil.parser`; `flask` (`current_app`, `url_for`, `request`); `sqlalchemy.ext.hybrid` (`hybrid_method`, `hybrid_property`)
- Used by: `padel_app/modules/api.py` (same scope): `download_csv`/`upload_csv_to_db` routes call `create_csv_for_model`/`upload_csv_to_model`; `padel_app/tools/input_tools.py` (same scope): uses `str_to_date`/`str_to_datetime` as its `Field` type converters; `padel_app/helpers/dashboard/events.py`, `player.py`, `coach_home.py` (same scope): `_date_label`, `_safe_int`, `_parse_range_or_default`; `padel_app/serializers/lesson.py` and `padel_app/serializers/calendar.py` (outside this scope): `iso_date`

## Query pointers

If you need to change how CSV import/export handles a field type, also read: `try_convert`/`str_to_bool`/`str_to_date`/`str_to_datetime` together — they form one fallthrough chain.
If you need to change the default dashboard date window, read: `_parse_range_or_default`, then check its one caller, `padel_app/helpers/dashboard/player.py`.
