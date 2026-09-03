---
path: frontend/apps/web/e2e/settings/profile-persistence.spec.ts
extracted_at: 2026-09-03T14:18:15Z
extraction_level: 2
size_lines: 149
size_tokens: 1190
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "fdf6224d86b0cf2e7cd5c742d394f28771d150f1dde4591647483204a5eb69d9"
---

## Purpose

PAD-81 ("Profile changes not saved despite success notification"): the Profile
panel used to be pure local React state seeded with hardcoded placeholder
values, so Save fired a success toast without ever calling the backend and
every edit was silently lost (`PATCH /api/auth/me` only accepted
`language` at the time). Pins that the form hydrates from `GET /api/auth/me`,
that saved name/abbreviation/email/phone persist through a real `PATCH`
round-trip and survive a reload, and that a failed save (mocked 500) reports
an explicit error rather than the false-success toast, with nothing written
server-side. Restores the seeded coach's original profile values via a direct
API patch in `afterEach` since the coach account is shared across the suite.

## Connections

Uses:
- ../helpers/auth: `loginAsCoach`
- ../helpers/navigation: `openSettings`

Used by: —

Semantically related (not imports): spec: settings.profile; exercises the
Profile panel component and `PATCH /api/auth/me`, the same endpoint
`settings/student-notification-blocks.spec.ts` uses to set/restore student
notification preferences.
