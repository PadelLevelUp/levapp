---
id: B-032
title: "Student dashboard \"Upcoming lessons\" KPI counts confirmed presences and reads 0 above a populated list"
type: layer-drift
severity: medium
status: resolved
affects:
  - dashboard.blocks
  - backend/padel_app/helpers/dashboard/kpis.py
  - backend/padel_app/helpers/dashboard/player_home.py
related_specs:
  - .specflow/specs/dashboard/blocks.spec.md
proposed_fix: "Derive the tile from the same 30-day event load schedule_7d uses; drop the confirmed-only query."
opened: 2026-09-09T00:00:00Z
resolved: 2026-09-09T00:00:00Z
---

# B-032 — Student "Upcoming lessons" KPI counts confirmed presences only

**Source:** PAD-235, recorded from the PAD-202 restyle (2026-09-07).

**What happens:** the tile reads "0 · next 30 days" while the "next 7 days" list right below it
shows three classes.

**Root cause:** Type 5 — layer drift. `compute_player_kpis().upcoming_lessons` counted
`Presence` rows with `confirmed = true` on future instances. The schedule block counts every
scheduled class the student is enrolled in (`load_events(player_id=…)`, which reads sign-ups and
presences alike). A student who has not yet answered the reminder is on the schedule but not in
the KPI, so the two disagree exactly when the reminders are pending — the normal case.

**Fix:** `build_player_kpi_block` now takes `now` and derives "Upcoming lessons" from the same
30-day `load_events` call the schedule uses (`dashboard.blocks` rule 3). The confirmed-only
`upcoming_lessons` field was removed from `PlayerKpis` so there is no second definition to drift.
