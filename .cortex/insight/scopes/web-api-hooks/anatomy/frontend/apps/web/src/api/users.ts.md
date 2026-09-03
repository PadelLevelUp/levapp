---
path: frontend/apps/web/src/api/users.ts
extracted_at: 2026-09-03T14:14:29Z
extraction_level: 2
size_lines: 23
size_tokens: 150
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "ea1ed8ad6e93bbb3290756709b8886272e5e321a6bbbba1b2b00561bcc520f5d"
---

## Purpose

`getUsers` (general listing) and `getMessageableUsers` — users the caller may start a NEW conversation with, doc-commented as scoped and block-filtered server-side. Both share the same mock fallback (`mockUsers`) despite being semantically different lists in real mode. Wraps `@levelup/api`'s `usersApi`.

## Connections

Uses:
- `frontend/apps/web/src/api/client.ts`: imported for its `initApi()` side effect.
- `frontend/apps/web/src/data/mockData.ts`: `mockUsers` for both functions' demo-mode payload.
- `@levelup/api/src/resources/users` (outside scope): `usersApi.getUsers`/`getMessageableUsers`.

Used by: no file within this scope (its consumer is the "start a new conversation" / user-picker UI, outside `api/`/`hooks/`/`data/`).
