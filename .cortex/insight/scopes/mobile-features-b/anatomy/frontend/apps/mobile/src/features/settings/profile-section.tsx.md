---
path: frontend/apps/mobile/src/features/settings/profile-section.tsx
extracted_at: 2026-09-03T14:12:18Z
extraction_level: 2
size_lines: 223
size_tokens: 1842
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "28572d7da035a409bd417b99db5ea07ee80b41748f92d0314f2ef3a23101bfbd"
---

## Purpose

`ProfileSection` (PAD-81) is the editable profile pane, mirroring web's Profile tab. The doc comment records that it replaced a screen showing name/username/role as read-only text with a comment claiming "/auth/me does not expose email on mobile" — that comment was stale: measured against the E2E backend, `GET /api/auth/me` actually returns `abbreviation`, `email` and `phone`, and `PATCH` accepts all three exactly as the `MeResponse`/`UpdateMePayload` types declare, so this is the real editable form. Like web, only changed fields are PATCHed (a `dirtyRef` plus a `saved` baseline diff), so opening the pane and saving without touching anything never re-submits or re-validates untouched values. Unlike web there's no page-level Save button to share, so the Save button lives inside this pane.

## Connections

Uses (external, not in this scope): `@levelup/api`'s `authApi` (`getMe`, `UpdateMePayload`, `updateMe`); `@/auth/AuthContext`'s `useAuth()` for the fallback identity when `/auth/me` hasn't resolved yet.

Used by: no in-scope file imports this section (no in-edges in this scope's L1 data); presumably composed into the Settings screen's `"profile"` section, per `settings-sections.ts`.
