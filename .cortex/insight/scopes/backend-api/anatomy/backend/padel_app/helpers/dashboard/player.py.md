---
path: backend/padel_app/helpers/dashboard/player.py
extracted_at: 2026-09-03T15:00:00Z
extraction_level: 2
size_lines: 108
size_tokens: 949
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "75b3d7cc0302c084c8cb3167d789495a316db96e17275fc023f2abdc205f4bcb"
---

## Purpose

Assembles a player's dashboard blocks: a KPI grid (attended/missed/upcoming/invites) plus a two-column grid of "upcoming lessons" and "invites to confirm" lists. Comments document the deliberate `href` policy — a KPI only links out when a matching route exists, so "Invites" ships without a link (no `/invites` page) while "Attended" and "Missed" were later wired to `/attendance` (PAD-114) and `/absences` (PAD-141) respectively, once those pages existed and could guarantee the same counting logic as the KPI.

## Connections

- Uses: `padel_app/tools/tools.py`: `_parse_range_or_default` for the dashboard's date window; `padel_app/helpers/dashboard/events.py`: `build_dashboard_event_lists` for the two lesson lists; `padel_app/helpers/dashboard/kpis.py`: `compute_player_kpis` for the KPI values
- Used by: `padel_app/helpers/dashboard_services.py`: `build_dashboard_payload` calls `build_player_dashboard_blocks` when the current user has a player profile
