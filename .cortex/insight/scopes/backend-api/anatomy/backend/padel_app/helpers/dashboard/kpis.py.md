---
path: backend/padel_app/helpers/dashboard/kpis.py
extracted_at: 2026-09-03T15:00:00Z
extraction_level: 2
size_lines: 114
size_tokens: 795
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "86c5d85204a9c61cf38b8dea0312080c69a75ef97b262efd7a589a27756a8c78"
---

## Purpose

Computes the raw KPI numbers behind the dashboard: `compute_player_kpis` (lessons attended/missed via `Presence.status`, upcoming confirmed lessons, invites still awaiting confirmation) and `compute_coach_kpis` (total roster size, presences pending validation, a hardcoded `monthly_revenue = 0` placeholder, plus a passed-through scheduled count). Each returns a frozen dataclass (`PlayerKpis`, `CoachKpis`) rather than a raw dict.

## Connections

- Uses: `padel_app/sql_db.py` (`db`) for session access; `padel_app.models` (`Presence`, `LessonInstance`, `Association_CoachPlayer`, `Association_CoachLesson`, `Lesson`) for the count queries; `sqlalchemy.func` for aggregate counts
- Used by: `padel_app/helpers/dashboard/player.py`: `build_player_dashboard_blocks` calls `compute_player_kpis`; `coach_home.py`'s week-pulse block computes its own totals rather than calling `compute_coach_kpis` directly (that function appears reserved for a coach KPI grid the current dashboard no longer renders — see `coach.py`'s note that `kpi_grid` was retired)
