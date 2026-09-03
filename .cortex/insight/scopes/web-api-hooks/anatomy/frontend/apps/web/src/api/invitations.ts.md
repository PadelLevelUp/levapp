---
path: frontend/apps/web/src/api/invitations.ts
extracted_at: 2026-09-03T14:14:29Z
extraction_level: 2
size_lines: 4
size_tokens: 20
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "98d75fe0d03e57de1f27eb74654d64258b89c2e1d2121690e6ecabba268df832"
---

## Purpose

A thin re-export barrel: `import "@/api/client"` for the `initApi()` side effect, then `export * from "@levelup/api/src/resources/invitations"` — the coach-invitation flow (fetch the coach's club, create/list/lookup/accept/revoke club-scoped invitations). Same shape as `availability.ts`, `fields.ts`, `notificationEngine.ts`, `playerInvitations.ts`.

## Connections

Uses:
- `frontend/apps/web/src/api/client.ts`: imported for its `initApi()` side effect.
- `@levelup/api/src/resources/invitations` (outside scope): re-exports its full surface.

Used by: no file within this scope.

Semantically related (not imports): `frontend/apps/web/src/api/playerInvitations.ts` — the parallel invitation flow for players rather than coaches; `availability.ts`, `fields.ts`, `notificationEngine.ts` share the same thin-barrel pattern.
