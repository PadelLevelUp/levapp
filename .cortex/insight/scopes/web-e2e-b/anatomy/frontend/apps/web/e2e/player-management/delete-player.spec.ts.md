---
path: frontend/apps/web/e2e/player-management/delete-player.spec.ts
extracted_at: 2026-09-03T15:30:00Z
extraction_level: 2
size_lines: 76
size_tokens: 604
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "f7d67718104d2050af4ec62a92cb0e5bbb71f0b98a92135bd8536a7fdbbff8ab"
---

## Purpose

E2E for PAD-18: player deletion goes through a confirmation dialog, not a
one-click destructive action. Two tests: deleting the seeded inactive "Ghost
Player" from their detail page (via "Delete player" → "are you sure?" →
confirm) redirects to `/players` and the player is fully gone (search returns
"0 players"); cancelling the confirmation on a different seeded player
("Filler Player 01") closes the dialog and leaves the player and its detail
page intact. Uses `test.use({ video: "on" })` for this file — a deliberate,
file-scoped deviation from the suite's normal no-video default, presumably to
aid debugging a destructive-action flow.

## Connections

- Uses: `helpers/auth` (`loginAsCoach`); `helpers/navigation` (`openPlayers`).
  (Scope `web-e2e-a`.)
- Used by: — (Playwright entry point)
- Semantically related (not imports): exercises the delete-player route in
  `player_service.py` / `frontend_api.py` and
  `frontend/apps/web/src/pages/PlayerDetailPage.tsx`'s delete confirmation
  flow; covers `.specflow/specs/players/remove.spec.md`.
