---
path: frontend/apps/web/src/auth/RoleRoute.tsx
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 28
size_tokens: 148
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "0d25bf5f4ad06438995f834258b9514c1c54ca05aceb69c8d3029112c5765eea"
---

## Purpose

Route guard requiring a signed-in user whose `user.roles` intersects a caller-supplied `allowedRoles` array (e.g. `["coach"]`, `["player"]`). Redirects unauthenticated users to `/auth`, and authenticated-but-wrong-role users to `/page_not_found`. This is the guard behind most role-specific pages (players, calendar management extras, training, presences, availability) in `App.tsx`'s route table.

## Connections

Uses: `react-router-dom` (`Navigate`, external), `@/auth/AuthContext` (`useAuth`, this scope).

Used by: `frontend/apps/web/src/App.tsx`, wrapping `/players`, `/players/:playerId`, `/players/:playerId/attendance`, `/attendance`, `/players/:playerId/absences`, `/absences`, `/presences`, `/training`, `/training/exercises`, `/training/groups`, `/availability`.
