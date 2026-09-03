---
path: frontend/apps/web/src/api/register.ts
extracted_at: 2026-09-03T14:14:29Z
extraction_level: 2
size_lines: 27
size_tokens: 155
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "b1ef4d1d843b0482f6c8c468c481405f0244caed7b5562a236a086980f817c55"
---

## Purpose

Account-activation surface: `registerUser(userId)` and `activateAccount({ userId, content })`, both with a `console.log`-and-succeed mock branch. Wraps `@levelup/api`'s `registerApi`.

## Connections

Uses:
- `frontend/apps/web/src/api/client.ts`: imported for its `initApi()` side effect.
- `@levelup/api/src/resources/register` (outside scope): `registerApi.registerUser`/`activateAccount`.

Used by: no file within this scope (its consumer is the registration/activation flow, outside `api/`/`hooks/`/`data/`).
