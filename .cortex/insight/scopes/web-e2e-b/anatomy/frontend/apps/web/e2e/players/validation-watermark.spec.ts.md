---
path: frontend/apps/web/e2e/players/validation-watermark.spec.ts
extracted_at: 2026-09-03T15:30:00Z
extraction_level: 2
size_lines: 52
size_tokens: 489
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "f8af7d4b028813d4cf60a786c79dae717836124ce933cd0c55441b50cbe86946"
---

## Purpose

E2E for PAD-30: player cards visually distinguish validated (self-registered,
active, has a password) from unvalidated (never completed registration,
inactive, no password) players. Single test asserts BOTH sides of the
contrast using the seeded fixtures: "E2E Student" (validated) shows no
"Pending registration" badge and carries `data-validated="true"`; "Ghost
Player" (unvalidated — inactive, `password=None`) shows the "Pending
registration" badge, carries `data-validated="false"`, AND is visually faded
via an `opacity-60` utility class on the card.

## Connections

- Uses: `helpers/auth` (`loginAsCoach`); `helpers/navigation` (`openPlayers`).
  (Scope `web-e2e-a`.)
- Used by: — (Playwright entry point)
- Semantically related (not imports): exercises the player-card component in
  `PlayersPage.tsx` and the `status`/`password`-derived `data-validated`
  attribute; covers `.specflow/specs/players/list.spec.md`. Complements
  `player-management/search-edit-player.spec.ts`'s US-31 test, which covers
  the SAME "Ghost Player" unvalidated state from the detail-page side.
