---
id: B-010
title: "editor_api.py has a caller (web api/editor.ts) but no spec"
type: missing-dev-spec
severity: medium
status: triaged
affects:
  - backend/padel_app/modules/editor_api.py
  - frontend/apps/web/src/api/editor.ts
  - backend/padel_app/modules/editor.py
  - backend/padel_app/modules/api.py
  - settings.admin-editor
proposed_fix: "Write a dev spec for the editor surface under .specflow/specs/ (web-only admin/authoring is a permitted parity exception if recorded) and cover its routes with a route-authorization test."
opened: 2026-09-03T14:30:00Z
---

# B-010 — editor_api.py has a caller (web api/editor.ts) but no spec

The backend-api extraction found no backend caller; the web-api-hooks extraction then found the caller: `frontend/apps/web/src/api/editor.ts` calls these routes directly with raw axios (bypassing `@levelup/api`). So the surface is live and web-only, but no leaf in `.specflow/specs/` describes it and no test covers its authorization contract.

*Surfaced by the initial Cortex insight extraction, 2026-09-03; caller confirmed the same day.*

## Widened 2026-09-10 — PAD-267 (audit M9), same root cause

The missing spec also left the surface's security contract unwritten, and the audit's M9 finding is
what that produced. Observed on `origin/staging` 2026-09-10:

1. `modules/__init__.py` registers `editor`, `api` and `editor_api` unconditionally, so all three
   exist in production.
2. `editor_api.serialize` and `api.query` return every column, so a superadmin read carries password
   hashes, `generated_code`, device tokens, push subscription JSON and invitation/join tokens.
3. `api.edit` runs `getattr(obj, method_name)()` for every name in the request's `methods` list.
4. `api.download_csv` writes the whole table via `tools.create_csv_for_model` to
   `static/data/csv/<model>.csv`, which Flask serves without authentication.
5. The legacy surfaces accept `is_admin` as well as `is_superadmin`; the Jinja editor redirects a
   non-admin instead of refusing.

### Change Plan

**New spec:** `settings.admin-editor` implementing `settings.coach-configures-preferences-and-access`
(committed before code). Owner decisions via the coordinator, 2026-09-10: flag on in development and on
staging (`backend/.env.staging`), off in production; superadmin-only on every surface; redact both
ways; drop method invocation; drop the CSV routes.

### Resolution

_Filled in when the PR lands._

