---
path: frontend/apps/mobile/app/index.tsx
extracted_at: 2026-09-03T14:11:46Z
extraction_level: 2
size_lines: 25
size_tokens: 146
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "4560385582f3c078ff68194187f26f8e74b533a860058492a4264cf1c1297ab1"
---

## Purpose

The app's root route: an auth gate that shows a loading spinner while `AuthContext` resolves (silent token restore), then redirects to `/(tabs)/dashboard` if authenticated or `/login` otherwise. Pure routing — no other logic.

## Connections

Uses:
- `frontend/apps/mobile/src/auth/AuthContext.tsx`: `useAuth()` for `loading`/`isAuthenticated` (unresolved alias).

Used by: no file within this scope (expo-router's root `/` route).
