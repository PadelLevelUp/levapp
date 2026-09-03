---
path: frontend/apps/web/src/api/playerInvitations.ts
extracted_at: 2026-09-03T14:14:29Z
extraction_level: 2
size_lines: 4
size_tokens: 22
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "6476236abb426817a1180fa85523c5ba47de8c0ad0c1ac92573140045875d196"
---

## Purpose

A thin re-export barrel: `import "@/api/client"` for the `initApi()` side effect, then `export * from "@levelup/api/src/resources/playerInvitations"` — a coach creating an "incomplete player" placeholder and invite link (`createIncompletePlayer`), the invitee looking up invite details by token, and accepting to activate their own account. Same shape as `availability.ts`, `fields.ts`, `invitations.ts`, `notificationEngine.ts`.

## Connections

Uses:
- `frontend/apps/web/src/api/client.ts`: imported for its `initApi()` side effect.
- `@levelup/api/src/resources/playerInvitations` (outside scope): re-exports its full surface.

Used by: no file within this scope.

Semantically related (not imports): `frontend/apps/web/src/api/invitations.ts` — the parallel invitation flow for coaches rather than players; `frontend/apps/web/src/api/players.ts` — `@levelup/api`'s `createIncompletePlayer` invalidates that file's coach-players cache so a new placeholder appears in the roster immediately.
