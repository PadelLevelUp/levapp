---
id: B-524
title: "E2E US-36 'search filters player list' failed every run: a fixed 500 ms wait and non-retrying reads saw the previous rows the list keeps while the next search loads"
type: test-defect
severity: low
status: resolved
affects:
  - frontend/apps/web/e2e/player-management/search-edit-player.spec.ts
  - frontend/apps/web/src/pages/PlayersPage.tsx
proposed_fix: "Wait with a retrying assertion on the list's total (data-total=0 on a players-pagination test id) and on the row's absence, instead of a fixed wait and a copy regex."
opened: 2026-10-12T13:48:00Z
resolved: 2026-10-12T13:48:00Z
---

# B-524 — US-36 read the stale player list

**Source:** Playwright on 2026-10-12, during the PAD-637 run (Session B). It failed 3 of 3, including on
plain origin/staging.

**What happened:** `search-edit-player.spec.ts` US-36 typed a search that matches nothing, waited a fixed
500 ms, and then read `.isVisible()` and `.count()` once. Neither of those retries. Since PAD-586
(2026-10-10), the Players query uses `placeholderData: keepPreviousData` (`PlayersPage.tsx`), so the
previous rows, including "E2E Student", stay on screen until the new search answers. The spec read those
stale rows. Its fallback, `/no players|no results|empty/`, never matches the real empty state, "Page 1 of 1
• 0 players".

**What should happen:** the spec waits until the search has answered, then checks the list is empty.

**Root cause:** a test defect. The app is correct: the failure snapshot showed "0 players".

**Evidence:** the failure snapshot (error-context) showed the search box at "zzz-no-match-zzz", the summary
at "Page 1 of 1 • 0 players", and no list rows.

### Resolution
- The summary carries `data-testid="players-pagination"` and `data-total`.
- The spec waits with `toHaveAttribute("data-total", "0")`, then `toHaveCount(0)` on the row.
