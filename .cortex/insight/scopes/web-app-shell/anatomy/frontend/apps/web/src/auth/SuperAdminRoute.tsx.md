---
path: frontend/apps/web/src/auth/SuperAdminRoute.tsx
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 23
size_tokens: 124
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "274dd3a5d0d53a0a6b6aad68795d90e7ad06f89287b1f68bac8e44faa29cd776"
---

## Purpose

Route guard requiring `user.isSuperAdmin`, the strictest of the three guards. Redirects unauthenticated users to `/auth` and authenticated-but-non-superadmin users to `/page_not_found`. Guards the generic DB-record editor (`EditorPage`), a super-admin-only tool.

## Connections

Uses: `react-router-dom` (`Navigate`, external), `@/auth/AuthContext` (`useAuth`, this scope).

Used by: `frontend/apps/web/src/App.tsx`, wrapping `/editor` and `/editor/:model`.
