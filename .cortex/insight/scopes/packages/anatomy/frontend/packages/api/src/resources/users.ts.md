---
path: frontend/packages/api/src/resources/users.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 14
size_tokens: 111
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "04a5874313587d9a5f543ab69b43cf87bd73f3577caaabd08264698c1a0752bf"
---

## Purpose

`getUsers` (full user list) and `getMessageableUsers` — users the caller may start a NEW conversation with, already scoped and block-filtered server-side.

## Connections

Uses:
- `frontend/packages/api/src/client.ts`: `getApi()` for `/app/users` and `/app/messageable-users`.
- `frontend/packages/types/src/domain.ts` (via `@levelup/types`): `User`.

Used by:
- `frontend/packages/api/src/index.ts`: re-exported as `usersApi`.
