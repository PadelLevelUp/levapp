---
id: B-011
title: "Web seasons API hand-rolls axios instead of using @levelup/api"
type: layer-drift
severity: medium
status: resolved
affects:
  - R-012
  - R-024
  - frontend/apps/web/src/api/seasons.ts
  - frontend/apps/mobile/src/features/settings/settings-api.ts
  - frontend/packages/api/src/resources
related_specs:
  - ../../../.specflow/specs/calendar/seasons.spec.md
proposed_fix: "Add a seasons resource to @levelup/api and make apps/web/src/api/seasons.ts a thin re-export like its siblings, so mobile can share it."
opened: 2026-09-03T14:30:00Z
resolved: 2026-09-04T00:00:00Z
resolved_by: PAD-176
---

# B-011 — Web seasons API hand-rolls axios instead of using @levelup/api

`apps/web/src/api/seasons.ts` is the one CRUD domain in the web api layer with no `@levelup/api` counterpart: it issues raw axios calls. That violates R-012 and, more materially, means season logic is not shared with the mobile app — a standing parity gap under R-024.

*Surfaced by the initial Cortex insight extraction (web-api scope), 2026-09-03.*

## Resolution — PAD-176 (2026-09-04)

`frontend/packages/api/src/resources/seasons.ts` now owns `getSeasons`,
`addSeasons` and `deleteSeason` plus the `SeasonUpsert` type, exported as
`seasonsApi` from `@levelup/api`. `apps/web/src/api/seasons.ts` is a thin
wrapper that keeps only its web-only `USE_MOCK_DATA` short-circuits, matching
`api/attendance.ts` and `api/classes.ts`.

The parity half of the bug was worse than the ledger recorded: mobile had built
its **own** copy of the same three calls in
`apps/mobile/src/features/settings/settings-api.ts`, also on raw `getApi()`, so
the season write contract lived in two places that could drift independently.
`seasons-section.tsx` now consumes `seasonsApi` and that duplicate is gone;
`settings-api.ts` retains only the import-history helpers. Covered by
`packages/api/src/resources/seasons.test.ts`.

Endpoints, payloads and behaviour are unchanged — this was a client-layering
fix only, so `.specflow/specs/calendar/seasons.spec.md` needed no edit.

**Not covered by this fix:** `apps/web/src/api/import.ts` also has no shared
resource (the ledger's "the one CRUD domain" was imprecise), and its mobile
counterpart is the surviving half of `settings-api.ts`. Same shape of drift,
tracked separately.
