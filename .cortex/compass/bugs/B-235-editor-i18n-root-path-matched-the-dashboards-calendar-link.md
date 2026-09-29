---
id: B-235
title: "E2E editor-i18n PAD-55 asserted the only 'Calendar' link on '/', but the coach dashboard has two once its schedule block renders"
type: test-defect
severity: low
status: resolved
affects:
  - frontend/apps/web/e2e/editor/editor-i18n.spec.ts
proposed_fix: "Scope the assertion to the sidebar navigation's Calendar link."
opened: 2026-09-29T18:06:51Z
resolved: 2026-09-29T18:06:51Z
---

# B-235: PAD-55's root-path check raced the dashboard's schedule block

**Source:** the wave-9 gate (2026-09-29), shard 1/4 at `1b6f4f0ff`. It was first misread as a regression (it passed
×2 on main by luck), then corrected.

**What happens:** `getByRole('link', { name: 'Calendar' })` on `/` raises a strict-mode violation, because it
resolves to 2 elements:
- the sidebar's link;
- the dashboard schedule block's "Calendar" link (`Schedule7Days.tsx`, `dashboard-schedule`, since `83ceda71`,
  2026-08-21).

The spec was last changed on 2026-07-15, before that link existed.

**Root cause (observed):** a race.
- The check passes when it runs before the schedule block has fetched and rendered, and fails after.
- On the same commit, results flip run to run: main passed ×2 at 17:32Z, then failed at 17:35Z.
- A deterministic cell on main: after waiting for `dashboard-schedule`, the bare locator fails 2/2, and the
  navigation-scoped one passes 2/2.

Test-only: the app legitimately has both links.

### Change Plan (Type 7)

Scope the assertion to `getByRole('navigation').getByRole('link', { name: 'Calendar' })`.

### Resolution

- Test: `editor-i18n.spec.ts`, a one-locator change.
- **2×2** (old/new spec × with/without a wait for `dashboard-schedule`):
  - the old spec failed both cells with the strict-mode violation;
  - the new spec passed both cells (2 passed each).
- **Green:** 5/5 with mobile-month-view.
- Resolved: 2026-09-29T18:06:51Z.
