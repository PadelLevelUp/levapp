---
path: frontend/apps/web/src/api/auth.ts
extracted_at: 2026-09-03T14:14:29Z
extraction_level: 2
size_lines: 41
size_tokens: 308
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "9693a5d7f320dca9eb718ad130c47048e4aff954abe53e6c40ea99bce86bc24d"
---

## Purpose

The signed-in user's own profile surface: `getMe` (with a fully hand-written mock `MeResponse` fixture rather than pulling from `mockData.ts`), `updateMe`, and `deleteAccount` (soft-deletes the account and invalidates all sessions server-side — the doc comment cites App Store review guideline 5.1.1(v), the account-deletion requirement). All three delegate to `@levelup/api/src/resources/auth`'s `authApi` in real mode.

## Connections

Uses:
- `frontend/apps/web/src/api/client.ts`: imported for its `initApi()` side effect.
- `frontend/apps/web/src/data/mockData.ts`: `MOCK_COACH_ID`, used as the mock `getMe` response's `coachId`.
- `@levelup/api/src/resources/auth` (outside scope): `authApi.getMe`/`updateMe`/`deleteAccount`, and re-exports its `MeResponse`/`UpdateMePayload` types.

Used by: no file within this scope (its consumers are auth/profile UI, outside `api/`/`hooks/`/`data/`).
