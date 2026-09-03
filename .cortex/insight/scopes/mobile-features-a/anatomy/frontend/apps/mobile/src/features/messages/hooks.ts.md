---
path: frontend/apps/mobile/src/features/messages/hooks.ts
extracted_at: 2026-09-03T14:12:16Z
extraction_level: 2
size_lines: 32
size_tokens: 241
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "5ba826a4e857b48eec7194de5a4d2fda4d4a9a57acc1315c1ed08d319e8ff6cc"
---

## Purpose

Two read-only user-list query hooks. `useUsers` returns every active user (`GET /app/users`). `useMessageableUsers` returns the narrower, scoped-and-block-filtered set (`GET /app/messageable-users`) that the "New conversation" picker must use instead of `useUsers` — using the wrong one would let a coach/student start a conversation with someone outside their messaging scope or with a user who has blocked them.

## Connections

Uses:
- `@levelup/api` (frontend/packages/api/src/index.ts): `usersApi.getUsers`, `usersApi.getMessageableUsers`.
- `@levelup/types` (frontend/packages/types/src/index.ts): `User`.

Used by: none within this scope — consumed by the "New conversation" picker screen outside this slice.
