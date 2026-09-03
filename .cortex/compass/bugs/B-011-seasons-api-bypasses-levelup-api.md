---
id: B-011
title: "Web seasons API hand-rolls axios instead of using @levelup/api"
type: layer-drift
severity: medium
status: open
affects:
  - R-012
  - frontend/apps/web/src/api/seasons.ts
  - frontend/packages/api/src/resources
proposed_fix: "Add a seasons resource to @levelup/api and make apps/web/src/api/seasons.ts a thin re-export like its siblings, so mobile can share it."
opened: 2026-09-03T14:30:00Z
---

# B-011 — Web seasons API hand-rolls axios instead of using @levelup/api

`apps/web/src/api/seasons.ts` is the one CRUD domain in the web api layer with no `@levelup/api` counterpart: it issues raw axios calls. That violates R-012 and, more materially, means season logic is not shared with the mobile app — a standing parity gap under R-024.

*Surfaced by the initial Cortex insight extraction (web-api-hooks scope), 2026-09-03.*
