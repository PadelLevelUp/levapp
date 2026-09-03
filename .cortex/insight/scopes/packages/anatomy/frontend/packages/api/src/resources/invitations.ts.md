---
path: frontend/packages/api/src/resources/invitations.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 82
size_tokens: 481
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "3c7081dff97251f5ae2a51b223ad8955fc0e52fca7008f0e75d4ea1881d3ff1f"
---

## Purpose

Coach-invitation flow: fetch the signed-in coach's club (`getCoachClub`, returns `null` when the response has no club rather than throwing), and the full lifecycle for club-scoped coach invitations — create, list pending, look up by token, accept (returns an access token, implying the accept flow logs the new coach in immediately), revoke.

## Connections

Uses:
- `frontend/packages/api/src/client.ts`: `getApi()` for `/app/coach`, `/app/club/:id/coach-invitations`, `/app/coach-invitations/:token[/accept|/revoke]`.

Used by:
- `frontend/packages/api/src/index.ts`: re-exported as `invitationsApi`.

Semantically related (not imports): `frontend/packages/api/src/resources/playerInvitations.ts` — the parallel invitation flow for players joining a coach's roster; shares the token/expiresAt/inviteLink shape but is a separate module with separate types.
