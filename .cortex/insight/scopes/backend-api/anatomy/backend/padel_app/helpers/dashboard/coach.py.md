---
path: backend/padel_app/helpers/dashboard/coach.py
extracted_at: 2026-09-03T15:00:00Z
extraction_level: 2
size_lines: 40
size_tokens: 351
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "fd19c3edcdb8aa99ff390b7aa01cefce96868b3d79bc731c270d6e87d84f959f"
---

## Purpose

Assembles the ordered list of dashboard blocks shown to a coach: an optional "next class" hero (omitted, not emptied, when nothing is scheduled), a "needs you" action queue, the 7-day schedule, and the week-pulse summary. The docstring records that older `kpi_grid`/`pending_confirmations`/`notification_activity` blocks were retired in favor of these actionable ones.

## Connections

- Uses: `padel_app/helpers/dashboard/coach_home.py`: pulls `build_next_class_block`, `build_needs_you_block`, `build_schedule_block`, `build_week_pulse_block` — this file is a thin ordering wrapper around coach_home's block builders
- Used by: `padel_app/helpers/dashboard_services.py`: calls `build_coach_dashboard_blocks` to compose the coach dashboard payload
