---
id: B-009
title: "`compute_coach_kpis` has no caller"
type: layer-drift
severity: low
status: open
affects:
  - backend/padel_app/helpers/dashboard/kpis.py
proposed_fix: "Delete, or record the intent in the dashboard spec and reference it from a follow-up ticket."
opened: 2026-09-03T14:30:00Z
---

# B-009 — `compute_coach_kpis` has no caller

Repo-wide grep finds no caller; kept only for a possible kpi_grid revival. Dead code in the dashboard helpers misleads readers about what the dashboard computes.

*Surfaced by the initial Cortex insight extraction (backend-api scope, 2026-09-03). Not yet re-verified by a human.*
