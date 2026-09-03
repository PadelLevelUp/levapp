---
path: frontend/apps/web/src/auth/AuthContext.tsx
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 118
size_tokens: 769
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "666756ba6a5c5604c0537f72d6b4d739003aeb14220a71bcb4c2ac8bd8ab0e5f"
---

## Purpose

The app's auth state provider and hook: owns the JWT (`localStorage["accessToken"]`), the current `user` (via `getMe`), `login`/`logout`, and a `loading` flag for silent session restore. On both restore and explicit login it applies the user's persisted UI language (PAD-40, `applyUserLanguage`) and, outside mock-data mode, refreshes the push-notification subscription (`requestAndSubscribe`). `USE_MOCK_DATA` short-circuits token/user handling to a fixed `"mock-token"` for local/demo use without a backend.

## Connections

Uses: `@/api/auth` (`getMe`, `MeResponse` type, outside this scope), `@/api/client` (`api`, for the best-effort `/auth/logout` POST, outside this scope), `@/config` (`USE_MOCK_DATA`, this scope), `@/utils/pushNotifications` (`requestAndSubscribe`, this scope), `@/i18n` (default `i18n` instance, this scope), `react` (external).

Used by: `frontend/apps/web/src/App.tsx` (`AuthProvider` wraps the route tree); `useAuth` is consumed throughout `src/pages/*` and `src/auth/{HomeRoute,ProtectedRoute,RoleRoute,SuperAdminRoute}.tsx` (all this scope) for `isAuthenticated`/`user`/`login`/`logout`.
