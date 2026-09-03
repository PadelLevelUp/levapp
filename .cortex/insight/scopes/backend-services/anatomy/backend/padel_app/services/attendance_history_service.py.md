---
path: backend/padel_app/services/attendance_history_service.py
extracted_at: 2026-09-03T13:58:46Z
extraction_level: 2
size_lines: 247
size_tokens: 2419
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "da935b8190dd1a9e1f4a2c3ad2591b24a2eae36b20fbaa4997545fcc0e3aca67"
---

## Purpose

Builds the per-player "Presenças" (attended, PAD-114) and "Faltas"
(missed, PAD-141) history pages. Both charts are generated from one
shared function, `build_presence_history`, which differs only by the
`Presence.status` predicate it filters on (`"present"` vs `"absent"`);
thin wrappers `build_attendance_history`/`build_absence_history` pin
that predicate so call sites can't drift. Handles date-range
normalization, automatic chart granularity selection (day/month/year
based on span), gap-filled bucket series (so empty periods still render
as zero rather than vanishing from the x-axis), and per-session calendar
deep links.

## Connections

- Uses: `padel_app.models` (`LessonInstance`, `Presence`) — read-only
  queries; `padel_app.sql_db` (`db`) — the query session; `sqlalchemy.orm.joinedload`.
- Used by: `services/presence_overview_service.py` (`GRANULARITIES`,
  `_as_naive_utc`, `_bucket_series`, `_bucket_start`, `pick_granularity`
  — reused directly so the roster-wide trend chart buckets dates
  identically to this per-player one).

## Insights

- Both pages intentionally share the SAME predicate their dashboard KPI
  tile uses (`helpers.dashboard.kpis.compute_player_kpis()`:
  `status == "present"` for `lessons_attended`, `status == "absent"` for
  `lessons_missed`), so a page can never show a different count than the
  KPI a student clicked through to reach it. In particular the absence
  page does NOT filter on `justification` — hiding justified absences
  would make the page disagree with `lessons_missed`.
- `presences` has no date column of its own; every timestamp is read off
  the joined `lesson_instances.start_datetime` (naive-UTC). This is a
  recurring assumption reused by `presence_overview_service.py`.
- `_calendar_href` always emits the materialized `lessoninstance-<id>`
  deep-link form, never the virtual `lesson-<id>-<date>` form — an
  attended class is by definition already materialized.
