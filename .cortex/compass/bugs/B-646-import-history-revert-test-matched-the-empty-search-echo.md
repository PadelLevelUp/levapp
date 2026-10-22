---
id: B-646
title: "The import-history revert E2E matched the player's name inside the empty-search message, so it failed while the app was right"
type: test-defect
severity: medium
status: resolved
affects:
  - frontend/apps/web/e2e/import-history/import-history.spec.ts
related_specs:
  - .specflow/specs/import/revert.spec.md
opened: 2026-10-21T23:50:00Z
---

# B-646: the revert E2E read the empty-search echo as the player (id unconfirmed, wave 16 range)

**Source:** PR #760's `subset #760` job, red twice (runs 39682942477, 39690585785); la-2110-SessionE.

**What happens:** `import-history.spec.ts:181` "PAD-21: revert only removes items from that specific
upload" reverts the newest import, opens /players, searches each reverted player's name and asserts
`getByText(name)` is not visible. Since PAD-665 slice 2 (08b6c9aaa, 2026-10-14, "search feedback on
every coach-side search") an empty search shows `No player found for “<name>”`
(`player-search-empty`). `getByText(name)` resolves to that message, so the assertion fails although
the player was removed.

**Evidence (isolated stack, the one spec ×2):** red 2/2 on PR #760 head 9600ef75b, on origin/staging
4f8c9cd62 and on main 0ee4e837d, so it has been in production since promotion 15 and is not set 2's.
The page snapshot at the failure is the empty state. The revert itself works: the sibling test (no
search) passes.

**Root cause:** a negative text assertion that a later UI change could satisfy by echoing the text.
The `waitForTimeout(500)` before it also hid that the search state was never asserted.

**Fix:** after each search, wait for `player-search-empty` (it proves the search ran and found
nothing), and require no element whose whole text is the name. Test-only; no app change.
