---
path: frontend/apps/web/e2e/player-management/players-sort-filter-alerts.spec.ts
extracted_at: 2026-09-03T15:30:00Z
extraction_level: 2
size_lines: 138
size_tokens: 1193
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "2d6a3bdfa0737b9fbb6a15965e1e756b98f4c2b4e3cbb6a68b1ece0a47bba58f"
---

## Purpose

E2E for PAD-13: sorting, filtering, and data-quality alerts on the Players
tab, six tests under one `describe`. Default A-Z name sort is verified against
a `localeCompare` re-sort of the same list; a sort `<Select>` (`combobox` named
/sort/i`) can switch to "Name Z-A" and "Level High-Low" (asserting the
level-less seeded "Ghost Player" is not first when sorting by level
descending); "data quality alert" banners surface counts of players missing a
level and missing a playing side; clicking the "without level" alert filters
the list down to exactly the players missing one (asserting "Ghost Player" is
included and the filtered count is below the full 30); and a clear/toggle
control restores the full paginated view. All tests share a `beforeEach` that
waits for real `.font-medium.truncate` player-name nodes (not the loading
skeleton) before asserting.

## Connections

- Uses: `helpers/auth` (`loginAsCoach`); `helpers/navigation` (`openPlayers`).
  (Scope `web-e2e-a`.)
- Used by: — (Playwright entry point)
- Semantically related (not imports): exercises `PlayersPage.tsx`'s sort
  control, data-quality alert banners, and alert-click filtering, backed by
  `player_service.py`'s list/sort query params; covers
  `.specflow/specs/players/list.spec.md`.
