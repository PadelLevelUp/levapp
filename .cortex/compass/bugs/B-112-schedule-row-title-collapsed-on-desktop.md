---
id: B-112
title: "The dashboard's Next 7 days gave every class title 66px on a 1280px desktop"
type: incomplete-rule
severity: medium
status: resolved
affects:
  - frontend/apps/web/src/components/dashboard/coach/Schedule7Days.tsx
proposed_fix: "Switch the row between stacked and one-row layouts on the list's own width (container query), not the viewport's lg breakpoint."
opened: 2026-09-16T15:17:56Z
---

# B-112 — Schedule rows keyed their layout to the viewport, not the list

**Source:** weekly QA sweep 2026-09-13 (D-1, previously D-D; reported as a P3 truncation nit
on 2026-08-30 and 2026-09-07). Ticket PAD-336. Bug number from Session E's reserved range
(unconfirmed).

**What happened:** `Schedule7Days` switched to its one-row desktop layout at Tailwind `lg:`
(viewport ≥1024px). On desktop the dashboard puts the schedule in the left grid column, which at
1280px is about 530px wide. The row's fixed columns take ~464px: padding 32, date 40, time 56,
fill bar 96, badge 80, invite 80, plus gaps. That left the title 66px, whatever its text, so every
seeded row read "E2E …". Reproduced before the fix by
`e2e/dashboard/schedule-title-width.spec.ts`: 66px shown, 193px needed.

**Why the spec did not catch it:** `dashboard.blocks` described the desktop page as two columns
and the rows as fixed columns, but never said which width decides the row's layout. The
viewport breakpoint and the column's real width disagree by ~500px.

**Fix (PAD-336):** container queries on the list (`[container-type:inline-size]`). The one-row
layout applies from 760px of list width, and the invite column from 480px. Web-only: the iOS
schedule already stacks the title.
