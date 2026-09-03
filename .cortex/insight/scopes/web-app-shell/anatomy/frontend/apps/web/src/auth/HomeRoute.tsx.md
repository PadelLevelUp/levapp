---
path: frontend/apps/web/src/auth/HomeRoute.tsx
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 23
size_tokens: 189
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "f37819b2f052d79dd10613e3e559793b179561eb2f19b9bc96df25497b76accc"
---

## Purpose

Renders one of two pages at `/` depending on auth state: `LandingPage` (public marketing page) for a visitor, `DashboardPage` for a signed-in user. Returns `null` while auth is still resolving — the doc comment explains this matters more here than in `ProtectedRoute` because a returning user's session restore takes one `/auth/me` round trip, and without the guard they'd see the marketing page flash before the dashboard replaces it.

## Connections

Uses: `@/auth/AuthContext` (`useAuth`, this scope), `@/pages/DashboardPage`, `@/pages/LandingPage` (both this scope).

Used by: `frontend/apps/web/src/App.tsx` (the `/` route's `element`).
