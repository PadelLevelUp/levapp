---
path: frontend/apps/web/src/api/availability.ts
extracted_at: 2026-09-03T14:14:29Z
extraction_level: 2
size_lines: 4
size_tokens: 20
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "7e9f9f6af6ecc93cc54cf04481c1fbaffb439464962eb242053a225372bdc155"
---

## Purpose

A thin re-export barrel: `import "@/api/client"` for the `initApi()` side effect, then `export * from "@levelup/api/src/resources/availability"` — the student-availability-blocker CRUD (PAD-28: windows a student marks unavailable that suppress automatic class invitations). Same shape as `fields.ts`, `invitations.ts`, `notificationEngine.ts`, `playerInvitations.ts`: no web-specific logic, no mock branch.

## Connections

Uses:
- `frontend/apps/web/src/api/client.ts`: imported for its `initApi()` side effect.
- `@levelup/api/src/resources/availability` (outside scope): re-exports its full surface.

Used by: no file within this scope.

Semantically related (not imports): `frontend/apps/web/src/api/fields.ts`, `invitations.ts`, `notificationEngine.ts`, `playerInvitations.ts` — the same thin-barrel pattern.
