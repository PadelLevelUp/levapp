---
id: B-010
title: "editor_api.py has a caller (web api/editor.ts) but no spec"
type: missing-dev-spec
severity: low
status: open
affects:
  - backend/padel_app/modules/editor_api.py
  - frontend/apps/web/src/api/editor.ts
proposed_fix: "Write a dev spec for the editor surface under .specflow/specs/ (web-only admin/authoring is a permitted parity exception if recorded) and cover its routes with a route-authorization test."
opened: 2026-09-03T14:30:00Z
---

# B-010 — editor_api.py has a caller (web api/editor.ts) but no spec

The backend-api extraction found no backend caller; the web-api-hooks extraction then found the caller: `frontend/apps/web/src/api/editor.ts` calls these routes directly with raw axios (bypassing `@levelup/api`). So the surface is live and web-only, but no leaf in `.specflow/specs/` describes it and no test covers its authorization contract.

*Surfaced by the initial Cortex insight extraction, 2026-09-03; caller confirmed the same day.*
