---
path: frontend/packages/api/src/storage.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 11
size_tokens: 84
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "ab0061f9364e49e682d847538626dac29a87547668ac22baea8e6af52501a13b"
---

## Purpose

Defines the `TokenStorage` interface (`getToken`/`setToken`/`removeToken`, all async) that `client.ts` is parameterized over, so the auth-token persistence mechanism is injected per platform rather than hardcoded — web implements it with `localStorage`, mobile with AsyncStorage/SecureStore, and tests with an in-memory object.

## Connections

Uses: none (leaf, no imports).

Used by:
- `frontend/packages/api/src/client.ts`: `ApiClientOptions.storage` is typed against this interface, and both interceptors call its methods.
- `frontend/packages/api/src/index.ts`: re-exports the type.
- `frontend/packages/api/src/client.test.ts`: `memoryStorage()` implements this interface as the in-memory test double.
