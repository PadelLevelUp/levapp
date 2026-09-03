---
path: frontend/packages/api/src/resources/register.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 20
size_tokens: 106
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "ea54162f528bb8eafaf39011c7a9dfe37cb73ec1bbd910faeea9fdecfe6252dd"
---

## Purpose

Account-activation flow for a user created server-side ahead of time: `registerUser` fetches the pending registration by user id, `activateAccount` submits the activation form content. Both are untyped (`Promise<any>`), unlike the rest of the auth-adjacent modules.

## Connections

Uses:
- `frontend/packages/api/src/client.ts`: `getApi()` for `/app/register/user/:id` and `/app/activate/user/:id`.

Used by:
- `frontend/packages/api/src/index.ts`: re-exported as `registerApi`.
