---
path: frontend/apps/web/e2e/player-management/player-side-both.spec.ts
extracted_at: 2026-09-03T15:30:00Z
extraction_level: 2
size_lines: 46
size_tokens: 427
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "6cbba4d27e079ecfd1e2dc8ed8587c13092c4b812d07113ccb1b2b57e14c00ca"
---

## Purpose

E2E for PAD-15: extends the player's preferred-side field from a binary
Left/Right choice to a third "Both" option. Single test: opens the E2E
Student profile, enters the PlayerHeader inline edit mode, selects "Both"
from the Side `<Select>` (the FIRST `[role="combobox"]` in the header), saves,
confirms no error and the "Both" badge renders, then reloads the page to
confirm the value round-tripped through the backend rather than only updating
client state.

## Connections

- Uses: `helpers/auth` (`loginAsCoach`); `helpers/navigation` (`openPlayers`).
  (Scope `web-e2e-a`.)
- Used by: — (Playwright entry point)
- Semantically related (not imports): exercises
  `frontend/apps/web/src/components/players/detail/PlayerHeader.tsx`'s Side
  select and `player_service.py`'s player-update route; covers
  `.specflow/specs/players/edit.spec.md`. Shares the "first combobox = Side,
  second = Level" locator convention with `players/set-player-level.spec.ts`
  and `search-edit-player.spec.ts`.
