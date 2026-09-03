---
path: frontend/apps/web/e2e/player-management/player-search-pagination.spec.ts
extracted_at: 2026-09-03T15:30:00Z
extraction_level: 2
size_lines: 50
size_tokens: 540
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "3f2214d867b5679cc3b8b3e317f892cd312b9cb70a6bf923b0a2903b3de0f005"
---

## Purpose

E2E for PAD-19: player search must query the entire database server-side, not
just the currently-loaded page. With 30 seeded players, PAGE_SIZE=25 and
`order_by id desc`, the three original named players land on page 2 — so
searching "E2E Student" from page 1 would return nothing under a
client-side-only (page-scoped) search. Three tests: a search across pages
finds "E2E Student"; a nonsense query shows zero matching player cards; and
clearing the search restores the paginated "Page 1 of N" view.

## Connections

- Uses: `helpers/auth` (`loginAsCoach`); `helpers/navigation` (`openPlayers`).
  (Scope `web-e2e-a`.)
- Used by: — (Playwright entry point)
- Semantically related (not imports): exercises the server-side search branch
  of the players list endpoint in `player_service.py` / `frontend_api.py` and
  `PlayersPage.tsx`; covers `.specflow/specs/players/list.spec.md`. Shares the
  "PAGE_SIZE=25, id-desc, seeded players land on page 2" fact with
  `add-player.spec.ts`, `search-edit-player.spec.ts`, `player-side-both.spec.ts`,
  and `players/*.spec.ts` in this scope, all of which route through search
  for the same reason rather than duplicate a scroll-to-page-2 helper.
