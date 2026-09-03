---
path: frontend/apps/web/e2e/player-management/search-edit-player.spec.ts
extracted_at: 2026-09-03T15:30:00Z
extraction_level: 2
size_lines: 73
size_tokens: 763
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "5cffd17ac21030fe92c34a591171bcf21ba410cd184755fce1736760a6de7d70"
---

## Purpose

Core player-search-and-edit coverage (US-36/37/31): search filters the player
list server-side to just the matching name, and clearing to a nonsense query
yields either an empty list or a "no results" message; editing a player's
level and side via `PlayerHeader`'s inline edit mode (Side is the first
combobox) saves without error; and a seeded inactive "Ghost Player" (no
account yet) shows an invite/registration message on their profile instead of
normal account info.

## Connections

- Uses: `helpers/auth` (`loginAsCoach`); `helpers/navigation` (`openPlayers`).
  (Scope `web-e2e-a`.)
- Used by: — (Playwright entry point)
- Semantically related (not imports): exercises `PlayersPage.tsx` search,
  `PlayerHeader.tsx` inline edit, and the "no account yet" branch of
  `PlayerDetailPage.tsx`; covers `.specflow/specs/players/list.spec.md` and
  `.specflow/specs/players/edit.spec.md`.
