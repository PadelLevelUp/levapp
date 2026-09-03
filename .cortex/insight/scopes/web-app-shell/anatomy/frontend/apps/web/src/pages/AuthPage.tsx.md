---
path: frontend/apps/web/src/pages/AuthPage.tsx
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 177
size_tokens: 1448
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "37bf0848e29edaa8ff207be2cf37a7b2f63129511a0fdf5e696eb30d5ab33ba0"
---

## Purpose

The `/auth` login page: username/password form validated client-side with `@levelup/validation`'s `usernameSchema`/`passwordSchema`, posts to `/auth/login` via the raw `api` client (not a dedicated `@/api/auth` helper), then calls `useAuth().login(accessToken)` and navigates to `/dashboard`. Wraps the submit flow in the app's launch overlay (`useLaunchOverlay`'s `begin`/`succeed`/`cancel`): the overlay is shown before the request goes out (not after it returns) so the reveal animation covers the login round-trip and the dashboard's own data-fetch, and it is cancelled immediately on failure so the destructive error toast is visible underneath it. Links to `/privacy` and `/terms`.

## Connections

Uses: `@/api/client` (`api`, outside this scope), `@/auth/AuthContext` (`useAuth`, this scope), `@/components/brand/launch-overlay` (`useLaunchOverlay`, outside this scope), `@/components/ui/{button,card,input,label}` (outside this scope), `@/hooks/use-toast` (outside this scope), `@levelup/validation` (external/workspace package), external `react`, `react-i18next`, `react-router-dom`.

Used by: `frontend/apps/web/src/App.tsx`, mounted unguarded at `/auth`.
