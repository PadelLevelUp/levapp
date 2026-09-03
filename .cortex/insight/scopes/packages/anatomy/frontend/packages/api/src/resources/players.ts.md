---
path: frontend/packages/api/src/resources/players.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 149
size_tokens: 1066
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "e6cfb1ffb48af24255b1a45e8e8867423e745eb8f5b3708f80ca5f29e375589c"
---

## Purpose

The coach roster surface: player CRUD (`addPlayer`, `editPlayer`, `removePlayer`, `getPlayerProfile`), coach-notes on a player (add/delete, `addCoachNote` returns the server's real id so an optimistic row can be re-keyed — PAD-101), and a module-level, TTL-based (60s) in-memory cache in front of `getCoachPlayers`/`getCoachPlayersPaginated` — a `full` blob cache plus a `pages` Map keyed by `"page:perPage"`, both cleared together by `invalidateCoachPlayersCache`, which every mutation in this file calls automatically. `getCoachPlayersPaginated` skips the cache entirely whenever any filter or non-default sort is active, so only the default unfiltered view is ever cached. This cache is separate from (and unaware of) the TanStack Query cache `@levelup/hooks` maintains via `queryKeys`.

## Connections

Uses:
- `frontend/packages/api/src/client.ts`: `getApi()` for `/app/players`, `/app/coach_players[_paginated]`, `/app/add_player`, `/app/edit_player`, `/app/player_profile/:id`, `/app/add_coach_note`, `/app/delete/coach_note`, `/app/remove_player`.
- `frontend/packages/types/src/domain.ts` (via `@levelup/types`): `CoachPlayer`, `CoachNote`, `Player`, `PlayerProfile`.

Used by:
- `frontend/packages/api/src/index.ts`: re-exported as `playersApi`.
- `frontend/packages/hooks/src/queries.ts`: `useCoachPlayersPaginated`, `usePlayerProfile` wrap `getCoachPlayersPaginated`/`getPlayerProfile`.
- `frontend/packages/api/src/resources/playerInvitations.ts`: calls `invalidateCoachPlayersCache()` after creating an incomplete player.
