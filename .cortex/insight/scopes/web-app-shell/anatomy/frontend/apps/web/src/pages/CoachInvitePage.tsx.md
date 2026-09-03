---
path: frontend/apps/web/src/pages/CoachInvitePage.tsx
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 207
size_tokens: 1577
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "db64053ee81c67dfde18708a51a8e78b386f8beba96087aad191bf17c51d49c4"
---

## Purpose

Public onboarding page at `/invite/coach/:token`: loads the invitation via `getCoachInvitation(token)` to show the club name, renders a name/username/password/repeat-password form validated with a local `zod` schema (`acceptSchema`), and on submit calls `acceptCoachInvitation` then `useAuth().login(accessToken)` and navigates to `/`. Handles three invitation states (`loading`/`valid`/`invalid`) — 404/410 responses (unknown, used, revoked, or expired token) render an "invalid invitation" card with a link back to `/auth`. A 409 on submit (username taken) surfaces inline rather than via toast.

## Connections

Uses: `@/api/invitations` (`getCoachInvitation`, `acceptCoachInvitation`, outside this scope), `@/auth/AuthContext` (`useAuth`, this scope), `@/components/ui/{button,card,input,label}` (outside this scope), `@/hooks/use-toast` (outside this scope), external `react`, `react-i18next`, `react-router-dom`, `zod`.

Used by: `frontend/apps/web/src/App.tsx`, mounted unguarded at `/invite/coach/:token`.
