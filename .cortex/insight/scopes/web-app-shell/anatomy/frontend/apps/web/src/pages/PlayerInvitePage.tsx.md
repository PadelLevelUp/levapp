---
path: frontend/apps/web/src/pages/PlayerInvitePage.tsx
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 205
size_tokens: 1548
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "309872cc2e7b64df539ac6ff86030a14f4ab4c887ac07f2f04a59e82085f3811"
---

## Purpose

Public onboarding page at `/invite/player/:token`, structurally identical to `CoachInvitePage.tsx` (this scope) but for players: no name field (just username/password/repeat-password, since the player's name is presumably already known from the invitation), loads via `getPlayerInvitation(token)`, submits via `acceptPlayerInvitation`, then `useAuth().login(accessToken)` and navigates to `/`. Same three-state (`loading`/`valid`/`invalid`) and 404/410/409 handling pattern as the coach invite page.

## Connections

Uses: `@/api/playerInvitations` (`getPlayerInvitation`, `acceptPlayerInvitation`, outside this scope), `@/auth/AuthContext` (`useAuth`, this scope), `@/components/ui/{button,card,input,label}` (outside this scope), `@/hooks/use-toast` (outside this scope), external `react`, `react-i18next`, `react-router-dom`, `zod`.

Used by: `frontend/apps/web/src/App.tsx`, mounted unguarded at `/invite/player/:token`.
