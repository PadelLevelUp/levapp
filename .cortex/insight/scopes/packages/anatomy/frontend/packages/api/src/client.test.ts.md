---
path: frontend/packages/api/src/client.test.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 3
size_lines: 166
size_tokens: 1390
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "acc37c5fef2233b54c4e21647bf027dfa8901ede95f6fe4162e2c8aab1bc7518"
---

## Purpose

Unit tests for `client.ts`'s auth behavior — the bearer-header attach, the rolling-refresh persist, and the 401 handling — plus a smoke test for the `initApi`/`getApi` singleton and `buildEventsUrl`. Runs the real interceptor chain against a canned axios adapter rather than mocking axios itself, so it validates the actual production interceptor code.

## Main players

- `memoryStorage` (lines 8–19) — supporting. In-memory `TokenStorage` test double with `vi.fn()`-spied methods, used to assert on `getToken`/`setToken`/`removeToken` calls.
- `installAdapter` (lines 32–53) — critical. Installs a canned-response `axios` adapter on `client.defaults.adapter` so requests never hit the network but still flow through the real request/response interceptors; throws an `AxiosError` for status >= 400 so the response interceptor's 401 branch actually fires.
- `describe("createApiClient")` (55–144) — critical. Covers: attaching `Authorization: Bearer <token>`, no header when storage is empty, persisting `x-new-token` on success, not touching storage without that header, clearing the token + firing `onUnauthorized` on 401, surviving a 401 with no `onUnauthorized` callback, and NOT clearing the token on non-401 errors (e.g. 500).
- `describe("initApi / getApi singleton")` (146–157) — critical. Asserts `getApi()` throws before `initApi()` is called, and returns the same instance after.
- `describe("buildEventsUrl")` (159–166) — supporting. Pins the SSE URL shape from `sse.ts`.

## Insights

- `installAdapter` feeds requests through the REAL interceptor chain via a canned adapter rather than mocking `axios` module methods — these tests exercise the actual production interceptor code, not a stand-in for it.
- The "`getApi` throws before `initApi`" assertion relies on vitest's per-test-file module isolation (fresh singleton state) and on running FIRST in this describe block; a test added earlier in the file that calls `initApi` would silently break this assertion's premise.
- Tests assert `onUnauthorized` fires on 401 but never assert its ordering relative to `storage.removeToken()` — that ordering guarantee (remove-then-callback) is documented only in `client.ts`'s interceptor code, not pinned here.

## Connections

Uses:
- `frontend/packages/api/src/client.ts`: `createApiClient`, `initApi`, `getApi` under test.
- `frontend/packages/api/src/sse.ts`: `buildEventsUrl` under test.
- `frontend/packages/api/src/storage.ts`: the `TokenStorage` type `memoryStorage` implements.

Used by: none (leaf test file, not imported anywhere).

## Query pointers

If you need to change the auth interceptor behavior in `client.ts`, update this file's matching `describe("createApiClient")` case in the same change — every documented interceptor branch (bearer attach, refresh persist, 401 clear, non-401 no-op) has a pinned test here.
If you need to test another resource module's HTTP behavior, this file's `installAdapter` pattern is the template — it's the only place in the scope demonstrating how to fake axios responses without mocking the module.
