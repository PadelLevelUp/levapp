---
path: frontend/apps/web/src/pages/PlayersPage.tsx
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 396
size_tokens: 3436
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "9edf1cf236476c4007da4c9226a496d0cdbdae65c1c9753ec9aedaae235d0ed4"
---

## Purpose

The coach-only `/players` roster page. Server-side paginated (25/page via `getCoachPlayersPaginated`) with debounced search (300ms), sort (`name-asc`/etc., parsed into `sortBy`/`sortDir` params), and two mutually-exclusive alert filters (missing level / missing side — toggling one clears the other) whose counts come back from the API response's `alerts` field. Renders player cards in a grid with avatar initials, opens `AddPlayerSheet` for adding a new player (`addPlayer`) or an "incomplete" player without full onboarding (`createIncompletePlayer`), and shows an invite-link dialog after creation. Uses `PlayersToolbar` for the search/sort/filter controls.

## Connections

Uses: `@/api/coachLevel` (`getCoachLevels`), `@/api/playerInvitations` (`createIncompletePlayer`), `@/api/players` (`getCoachPlayersPaginated`, `addPlayer`) (all outside this scope), `@/auth/AuthContext` (`useAuth`, this scope), `@/components/layout/AppLayout`, `@/components/players/{AddPlayerSheet,PlayersToolbar}`, `@/components/ui/{alert,avatar,badge,button,card,dialog,input,loading-skeleton}` (all outside this scope), `@/hooks/use-toast` (outside this scope), `@/types` (outside this scope), external `lucide-react`, `react`, `react-i18next`, `react-router-dom`.

Used by: `frontend/apps/web/src/App.tsx`, mounted at `/players` behind `RoleRoute allowedRoles={["coach"]}`.
