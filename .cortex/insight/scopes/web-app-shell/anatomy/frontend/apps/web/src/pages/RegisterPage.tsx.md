---
path: frontend/apps/web/src/pages/RegisterPage.tsx
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 252
size_tokens: 1890
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "51df4292d8009526ed42eb817995520b453135e2324d95d59a3d8d71120c9bb9"
---

## Purpose

Account-activation page at `/register/:userId` — distinct from the token-based invite pages, this one takes a raw `userId` and calls `registerUser(userId)` to check status/pre-fill an existing (pre-created, inactive) user record's name/username/email/phone. If `isActive` is already true it shows an "already registered" card; otherwise it renders a full registration form (name/username/email/phone/password/repeat) validated with a local `zod` schema and submits via `activateAccount`. On success, navigates to `/auth` (does NOT auto-login, unlike the coach/player invite pages) with a success toast.

## Connections

Uses: `@/api/register` (`registerUser`, `activateAccount`, outside this scope), `@/components/ui/{button,card,input,label}` (outside this scope), `@/hooks/use-toast` (outside this scope), external `react`, `react-i18next`, `react-router-dom`, `zod`.

Used by: `frontend/apps/web/src/App.tsx`, mounted unguarded at `/register/:userId`.
