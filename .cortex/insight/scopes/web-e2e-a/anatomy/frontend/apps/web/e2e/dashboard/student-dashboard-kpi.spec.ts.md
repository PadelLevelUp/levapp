---
path: frontend/apps/web/e2e/dashboard/student-dashboard-kpi.spec.ts
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 73
size_tokens: 793
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "b8da4999bfc386dbe3b964e9f1c259fdc2853517a6e33e43f209ed98d7c3d85a"
---

## Purpose

PAD-76 regression guard on dashboard KPI-card navigation (spec
`dashboard.navigation` rule 6, "only link where a route exists"): a KPI
with no destination page ("Invites", since `/invites` doesn't exist) must
render inert — not clickable, no button role, no navigation on click,
never landing on the 404 page — while KPIs that do have destinations
("Upcoming lessons" → `/calendar`, and since PAD-141 added `/absences`,
"Missed" → `/absences`) must actually navigate there. Explicitly notes the
PAD-141 test-target swap from "Missed" to "Invites" is a rule-6 example
change, not a weakened assertion.

## Connections

- Uses:
  - `helpers/auth.ts`: `loginAsStudent`.
  - `helpers/navigation.ts`: `openDashboard`.
- Used by: — (leaf spec file)
- Semantically related (not imports): `.specflow/specs/dashboard/navigation.spec.md`
  rule 6; PAD-141's `absences.spec.md` is the reason "Missed" moved from
  this file's inert-KPI example to its own live-navigation guard.
