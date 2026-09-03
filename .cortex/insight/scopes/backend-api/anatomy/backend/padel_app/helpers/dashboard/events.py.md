---
path: backend/padel_app/helpers/dashboard/events.py
extracted_at: 2026-09-03T15:00:00Z
extraction_level: 2
size_lines: 128
size_tokens: 1200
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "25c2740b70e0292201333334f5c83c99b0fe6f078c0b0825d3f215c77e33f1bb"
---

## Purpose

Builds the two role-specific lesson lists shown on the dashboard (`build_dashboard_event_lists`): coaches see "upcoming" (soonest 5 scheduled) plus "needs players" (biggest missing-seat gap first); players see "upcoming" plus "invites to confirm" (invited but not yet confirmed). Requires exactly one of `coach_id`/`player_id`. Also formats each event into a dashboard list-item dict with a deep link back into the calendar for that specific occurrence.

## Connections

- Uses: `padel_app/helpers/calendar_helpers.py`: `build_lesson_events`, `load_lessons_for_coach`/`load_lesson_instances_for_coach`, `load_lessons_for_player`/`load_lesson_instances_for_player` to fetch and shape raw lesson occurrences; `padel_app/tools/tools.py`: `_date_label` for display formatting, `_safe_int` for defensive int coercion on participant/seat counts
- Used by: `padel_app/helpers/dashboard/player.py`: `build_player_dashboard_blocks` calls this for the player's upcoming/invites lists
