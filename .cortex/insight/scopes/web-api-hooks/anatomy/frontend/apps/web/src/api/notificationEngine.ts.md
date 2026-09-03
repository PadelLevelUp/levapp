---
path: frontend/apps/web/src/api/notificationEngine.ts
extracted_at: 2026-09-03T14:14:29Z
extraction_level: 2
size_lines: 4
size_tokens: 22
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "429e8955cf3ab06ff8cd40ab1163e5acbb078db9a06b8f857d550ce525c34f2b"
---

## Purpose

A thin re-export barrel: `import "@/api/client"` for the `initApi()` side effect, then `export * from "@levelup/api/src/resources/notificationEngine"` — the class-invitation/notification engine's full client surface (config CRUD, per-class toggling, reminders, availability-conflict checks, response paths, waiting list, and more; the largest resource module in `@levelup/api`). Same shape as `availability.ts`, `fields.ts`, `invitations.ts`, `playerInvitations.ts`.

## Connections

Uses:
- `frontend/apps/web/src/api/client.ts`: imported for its `initApi()` side effect.
- `@levelup/api/src/resources/notificationEngine` (outside scope): re-exports its full surface.

Used by: no file within this scope.
