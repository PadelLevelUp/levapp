---
path: frontend/apps/web/e2e/player-management/add-player.spec.ts
extracted_at: 2026-09-03T15:30:00Z
extraction_level: 2
size_lines: 48
size_tokens: 578
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "8c574fc83d39e786956bd7e1e5c7d6060fbe44b0d88084268f51dc79e40ec1dc"
---

## Purpose

Core player-list happy-path coverage (US-35/38/39): a coach can add a new
player through the add-player sheet by name alone (PAD-105 — no username
field, the backend assigns a placeholder), the new player is findable via
search (with a comment noting pagination math: PAGE_SIZE=25 across 31 seeded
players pushes new/late entries to page 2, so every assertion here searches
rather than scrolls), and clicking a player row navigates to
`/players/{id}` where the Evaluation and Strengths & Weaknesses sections
render.

## Connections

- Uses: `helpers/auth` (`loginAsCoach`); `helpers/navigation` (`openPlayers`).
  (Scope `web-e2e-a`.)
- Used by: — (Playwright entry point)
- Semantically related (not imports): exercises
  `frontend/apps/web/src/components/players/AddPlayerSheet.tsx` and
  `frontend/apps/web/src/pages/PlayersPage.tsx` /
  `frontend/apps/web/src/pages/PlayerDetailPage.tsx`, and the
  `player_service.py` / `frontend_api.py` create-player route on the backend;
  covers `.specflow/specs/players/create.spec.md` and
  `.specflow/specs/players/list.spec.md`.
