---
id: B-045
title: "Coach dashboard \"aulas por validar\" card 404s on click and disagrees with the Presences tab"
type: layer-drift
severity: high
status: resolved
affects:
  - dashboard.blocks
  - dashboard.navigation
  - attendance.validation
  - backend/padel_app/helpers/dashboard/coach_home.py
  - backend/padel_app/services/presence_overview_service.py
  - frontend/apps/web/src/components/dashboard/coach/NeedsYouQueue.tsx
  - frontend/apps/web/src/pages/PresencesPage.tsx
  - frontend/apps/mobile/src/features/dashboard/blocks.tsx
  - frontend/apps/mobile/src/features/presences/PresencesScreen.tsx
related_specs:
  - .specflow/specs/dashboard/blocks.spec.md
  - .specflow/specs/dashboard/navigation.spec.md
  - .specflow/specs/attendance/validation.spec.md
proposed_fix: "One unit (classes), one scope (a Presences-tab week), one helper (count_pending_validation) behind one count endpoint; the card links to /presences?week=<n> and the tab opens on that week."
opened: 2026-09-09T00:00:00Z
resolved: 2026-09-09T00:00:00Z
---

# B-045 — Coach dashboard "aulas por validar" card 404s on click and disagrees with the Presences tab

**Source:** PAD-201 (Discord report, 2026-09-06) and PAD-190 (PAD-140 review, 2026-09-03).

**What happens:** the coach dashboard's needs-you `validation` card reads "6 presenças para
validar · de 2 aulas na semana passada"; pressing *Rever* lands on the 404 page. The Presences
tab, opened by hand, says "1 aula por validar".

**What should happen:** the card and the tab show the same number, and the card opens the tab
on the week that holds the work.

**Root cause:** Type 5 — layer drift, twice over.

1. `coach_home._validation_item` emits `href: "/validations"`. No such route exists on web
   (`App.tsx` mounts the tab at `/presences`) and the mobile `go()` mapper has no case for it,
   so web hits `NotFound` and iOS silently does nothing. `dashboard.navigation` rule 6 already
   forbids exactly this ("a dashboard item must never link to a route that resolves to the 404
   page"); the rule was written for KPI tiles and the queue item was added later without
   re-checking it.
2. The card counts **presence rows** over a rolling **last-7-days** window; the tab's trigger
   counts **classes** over the **Monday–Sunday week being browsed** (`list_pending_validation`).
   Two independent derivations of "what is left to validate", so the two numbers can only agree
   by accident — the same defect `calendar.view` rule 9 fixed for `effective_filled_spots`.

**Evidence:**
1. `backend/padel_app/helpers/dashboard/coach_home.py` — `_validation_item` returns
   `"href": "/validations"` and `count` = `func.count(Presence.id)`.
2. `frontend/apps/web/src/App.tsx` — routes list has `/presences`, no `/validations`.
3. `frontend/apps/mobile/src/features/dashboard/blocks.tsx` — `canGo` lists
   `/calendar`, `/messages`, `/players`, `/attendance`, `/absences` only.
4. `frontend/apps/web/src/components/presences/ValidateClassesDialog.tsx` — trigger renders
   `pending.length` (classes) for `weekBounds(weekOffset)`.

**Affected specs:**
- Dev: `.specflow/specs/dashboard/blocks.spec.md` — rule 3 `validation` item redefined.
- Dev: `.specflow/specs/attendance/validation.spec.md` — rule 18 (count endpoint, `?week=`).
- Business: `.specflow/specs-business/dashboard/user-relies-on-the-dashboard.business.md` —
  the dashboard's "to validate" number is the Presences tab's number.

### Change Plan

**Decision (PAD-190):** see `.cortex/atlas/decisions/2026-09-09-one-number-for-classes-to-validate.md`.

1. `presence_overview_service.count_pending_validation(coach_id, range_start, range_end)` —
   the one helper. `list_pending_validation` keeps returning `pendingCount` from the same
   derivation.
2. `GET /api/app/class_instances/pending_validation/count?from&to` → `{from, to, pendingCount}`.
3. `_validation_item` reads the helper for the current Monday–Sunday UTC week, falls back to the
   previous week when the current one is empty, and emits `count` (classes), `weekOffset`
   (0 or -1) and `href: /presences` or `/presences?week=-1`.
4. Web `PresencesPage` honours `?week=`; its trigger reads the count endpoint for the same
   bounds. iOS `go()` maps `/presences` onto the tab with a `week` param; `PresencesScreen`
   honours it and its trigger reads the same count hook.
5. Tests: backend (`test_dashboard_coach_home.py`, `test_presence_overview.py`), Playwright
   `e2e/dashboard/validation-count.spec.ts` asserts card count == tab trigger count after the
   click.
