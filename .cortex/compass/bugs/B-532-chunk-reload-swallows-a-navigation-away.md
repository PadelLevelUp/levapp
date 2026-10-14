---
id: B-532
title: "Leaving a page while its route chunks load sent the browser back to it: WebKit cancelled the imports, lazyWithReload reloaded the page being left"
type: incomplete-rule
severity: medium
status: resolved
resolved: 2026-10-14T21:00:00Z
affects:
  - .specflow/specs/client/route-loading.spec.md
  - frontend/apps/web/src/lib/lazyWithReload.ts
proposed_fix: "For 2 s after beforeunload a rejected chunk import neither reloads nor rethrows; the navigation finishes. The window ends on its own, so a cancelled leave keeps the PAD-585 reload."
opened: 2026-10-14T20:40:00Z
---

# B-532: the chunk reload swallowed a navigation away

**Source:** CI of #727 (B-530), subset job 116038342172 on run 38618100708; la-1410-SessionB.
Found on `e2e/schedule-calendar/pad559-time-list-wheel.spec.ts` (webkit), not caused by #727.

**What happens:** `loginAsCoach` returns as soon as the URL leaves `/auth`; the dashboard's route
chunks are still loading when the spec calls `page.goto("/calendar")`. WebKit cancels the old
page's loads as the navigation starts ("Load request cancelled" on `DashboardPage`'s imports), the
dynamic import rejects, and PAD-585's `lazyWithReload` reloads — the page still being `/dashboard`
— which interrupts the goto: `page.goto: Navigation to "/calendar" is interrupted by another
navigation to "/dashboard"`. Chromium does not reject the import on unload, so only webkit was red.
A Safari user who navigates away (address bar, a full-page link) while a page loads hits the same
bounce.

**Evidence (2×2):**
- CI job 116038342172 (#727's subset): webkit red at `pad559-time-list-wheel.spec.ts:19`, the
  "alone" re-run in the same job red too, chromium green. The uploaded trace shows the cancelled
  chunk requests at 18:59:08.922, the cancelled `/calendar` at .928 and `GET /dashboard` (document)
  at .931.
- Local, `levelup_e2e_1410b2`, `--project=webkit --repeat-each=3`: 3 failed, same message.
- Fix, same stack, webkit + chromium ×3: 6 passed. Unit:
  `lazyWithReload.test.ts` "does not reload when the chunk failed because the page is being left"
  red before (reload called), green after; "reloads again once a cancelled leave is over" green.
