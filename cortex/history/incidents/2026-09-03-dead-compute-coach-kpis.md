---
about: "`compute_coach_kpis` has no caller"
permanence: stable
verified: "2026-09-03 (observed)"
origin:
  - migrated:compass/bugs/B-009-dead-compute-coach-kpis.md@ef7a5f3
need:
  - backend/padel_app/helpers/dashboard/kpis.py
aliases:
  - B-009
  - B-009-dead-compute-coach-kpis
---

# B-009 — `compute_coach_kpis` has no caller

Repo-wide grep finds no caller; kept only for a possible kpi_grid revival. Dead code in the dashboard helpers misleads readers about what the dashboard computes.

*Surfaced by the initial Cortex insight extraction (backend-api scope, 2026-09-03). Not yet re-verified by a human.*

<!-- 3.x fields of compass/bugs/B-009-dead-compute-coach-kpis.md, carried verbatim by cortex migrate -->
```yaml
type: layer-drift
severity: low
status: resolved
affects:
  - backend/padel_app/helpers/dashboard/kpis.py
proposed_fix: Delete, or record the intent in the dashboard spec and reference it from a follow-up ticket.
fixed: "2026-09-09"
fixed_by: PAD-174
```
