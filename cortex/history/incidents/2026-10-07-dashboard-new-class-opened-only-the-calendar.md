---
about: "Web dashboard: 'Nova aula' opened the calendar with nothing open; the calendar never read ?new=1"
permanence: stable
verified: "2026-10-07 (observed)"
origin:
  - migrated:compass/bugs/B-345-dashboard-new-class-opened-only-the-calendar.md@ef7a5f3
need:
  - frontend/apps/web/src/pages/CalendarPage.tsx
aliases:
  - B-345
  - B-345-dashboard-new-class-opened-only-the-calendar
---

# B-345 — "Nova aula" opened only the calendar (id unconfirmed, Session C range)

**Source:** PAD-520, reported by a coach via Discord.

**Observed (read at staging):** `CoachDashboard.tsx` navigates to `/calendar?new=1`.
`CalendarPage.readDeepLink` reads `classId`, `date` and `notify` only, so `new` was ignored. The
button's intent was written on one side and never read on the other; no spec named the param.

**Root-cause class:** a deep link with no criterion. Missing criterion. Fix: `dashboard.navigation`
rule 12 (number unconfirmed). iOS has no such control, so the fix is web-only.

**Reproduced:** `e2e/dashboard/pad520-new-class-opens-the-sheet.spec.ts`. Run recorded in the PR.

<!-- 3.x fields of compass/bugs/B-345-dashboard-new-class-opened-only-the-calendar.md, carried verbatim by cortex migrate -->
```yaml
type: missing-criterion
severity: medium
status: resolved
resolved: "2026-10-07"
affects:
  - dashboard.navigation
  - frontend/apps/web/src/pages/CalendarPage.tsx
proposed_fix: "The calendar reads new=1 once, opens the new-class sheet for a coach, and strips the param."
```
