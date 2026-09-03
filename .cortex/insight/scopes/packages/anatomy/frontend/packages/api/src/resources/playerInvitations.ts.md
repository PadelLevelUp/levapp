---
path: frontend/packages/api/src/resources/playerInvitations.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 61
size_tokens: 366
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "801459e88fa213a5426ea93d038b3eae4b1c5bd43690684777af7bd0c8b1ed85"
---

## Purpose

Player-invitation flow: a coach creates an "incomplete player" placeholder record and gets back an invite link/token (`createIncompletePlayer`, which also invalidates `players.ts`'s coach-players cache so the new placeholder appears in the roster immediately rather than after the cache's TTL), the invitee looks up invite details by token (`getPlayerInvitation`), and accepts to activate their own account (`acceptPlayerInvitation`, returns an access token).

## Connections

Uses:
- `frontend/packages/api/src/client.ts`: `getApi()` for `/app/incomplete_player`, `/app/player-invitations/:token[/accept]`.
- `frontend/packages/api/src/resources/players.ts`: calls `invalidateCoachPlayersCache()`.

Used by:
- `frontend/packages/api/src/index.ts`: re-exported as `playerInvitationsApi`.

Semantically related (not imports): `frontend/packages/api/src/resources/invitations.ts` — the parallel coach-invitation flow; same token/expiresAt/inviteLink shape, separate module.
