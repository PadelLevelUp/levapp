---
path: frontend/apps/web/src/auth/ProtectedRoute.tsx
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 21
size_tokens: 101
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "6739def7af5d85bf926263b99daa0f5490765a267a9dd73cd094ef9fc24beecd"
---

## Purpose

Route guard requiring any signed-in user (no role restriction). Renders `null` while auth is loading, redirects to `/auth` if not authenticated, otherwise renders `children`. The simplest of the three route guards in this scope — no role or super-admin check.

## Connections

Uses: `react-router-dom` (`Navigate`, external), `@/auth/AuthContext` (`useAuth`, this scope).

Used by: `frontend/apps/web/src/App.tsx`, wrapping `/dashboard`, `/calendar`, `/messages`, `/messages/:id`, `/settings`.
