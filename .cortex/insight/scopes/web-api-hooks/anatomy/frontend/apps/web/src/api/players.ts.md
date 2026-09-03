---
path: frontend/apps/web/src/api/players.ts
extracted_at: 2026-09-03T14:14:29Z
extraction_level: 2
size_lines: 122
size_tokens: 823
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "f0536d8e214abc2178b8f40c1c62218bf1d519ab9331328cec07207347af7bb7"
---

## Purpose

The coach roster surface: `getPlayers`, `getCoachPlayers`, `getCoachPlayersPaginated` (mock branch reimplements search/pagination in-memory over `mockCoachPlayers`, mirroring the real endpoint's page/pagination response shape), player CRUD (`addPlayer`, `editPlayer`, `removePlayer`), `getPlayerProfile`, and coach-notes on a player (`addCoachNote`, `deleteCoachNote`). Also re-exports `invalidateCoachPlayersCache` and the `CoachPlayersPageResponse`/`PlayersQueryParams` types from `@levelup/api/src/resources/players`. Wraps `@levelup/api`'s `playersApi`, which itself maintains a TTL-based in-memory cache in front of the paginated-list endpoint — this file's caller-facing wrapper does not add or change that caching.

## Connections

Uses:
- `frontend/apps/web/src/api/client.ts`: imported for its `initApi()` side effect.
- `frontend/apps/web/src/data/mockData.ts`: `mockPlayers`, `mockCoachPlayers`, `mockPlayerProfiles` for demo-mode payloads.
- `@levelup/api/src/resources/players` (outside scope): `playersApi.*`, `invalidateCoachPlayersCache`, `CoachPlayersPageResponse`, `PlayersQueryParams`.

Used by: no file within this scope (its consumer is the players/roster UI, outside `api/`/`hooks/`/`data/`).

Semantically related (not imports): `frontend/apps/web/src/api/playerInvitations.ts` — `@levelup/api`'s `createIncompletePlayer` calls this file's re-exported `invalidateCoachPlayersCache` after creating a placeholder player.
