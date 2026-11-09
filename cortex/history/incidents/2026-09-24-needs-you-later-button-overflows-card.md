---
about: "Coach dashboard: \"Mais tarde\" overflowed its needs-you card with the sidebar open"
permanence: stable
verified: "2026-09-24 (observed)"
origin:
  - migrated:compass/bugs/B-204-needs-you-later-button-overflows-card.md@ef7a5f3
need:
  - frontend/apps/web/src/components/dashboard/coach/NeedsYouQueue.tsx
aliases:
  - B-204
  - B-204-needs-you-later-button-overflows-card
---

# B-204: "Mais tarde" overflowed the card (PAD-424)

**Source:** owner feedback, PAD-424. On the coach dashboard, in "Precisa de ti", with the left sidebar open, "Mais tarde" sat outside the class card. It was fine with the sidebar hidden.

**What happens:** the card's buttons were in a `flex gap-2` row. shadcn `Button` is `whitespace-nowrap`, so neither button can shrink below its label; when the sidebar narrows the column, the row is wider than the card and "Mais tarde" leaves it.

**Root cause:** Type 1, a missing criterion. `dashboard.blocks` describes the card and its "Later" action (B-030) but nothing about its layout at narrow widths.

**Evidence (Phase 1, 2026-09-25, isolated stack, Chromium):** an E2E test measuring "Mais tarde" against its card at 1024/1152/1280/1366/1440px with the sidebar open (the default): the button overflowed at 4 of the 5 widths on the old code, and at 0 after the fix.

### Resolution
- Spec: `dashboard.blocks` paragraph (PAD-424) and the criterion "Mais tarde never leaves its card".
- Test: `e2e/dashboard/pad424-425-dashboard-actions.spec.ts`.
- Code: `NeedsYouQueue.tsx`, where the button row is `flex flex-wrap gap-2`.

<!-- 3.x fields of compass/bugs/B-204-needs-you-later-button-overflows-card.md, carried verbatim by cortex migrate -->
```yaml
type: missing-criterion
severity: medium
status: resolved
affects:
  - dashboard.blocks
  - frontend/apps/web/src/components/dashboard/coach/NeedsYouQueue.tsx
proposed_fix: The empty-seats card's button pair wraps (flex-wrap). Pinned by an E2E test at five desktop widths with the sidebar open.
resolved: "2026-09-25"
```
