---
id: B-050
title: "A verified coach who changes their email in Settings is sent straight back from the code screen"
type: layer-drift
severity: medium
status: resolved
affects:
  - settings.profile
  - auth.email-verification
  - frontend/apps/web/src/pages/SettingsPage.tsx
  - frontend/apps/web/src/pages/VerifyEmailPage.tsx
  - frontend/apps/mobile/src/features/settings/profile-section.tsx
  - frontend/apps/mobile/app/verify-email.tsx
related_specs:
  - .specflow/specs/settings/profile.spec.md
  - .specflow/specs/auth/email-verification.spec.md
proposed_fix: "After a Settings email change returns emailVerification \"pending\", refresh the signed-in user (refreshUser) before navigating to /verify-email, on web and iOS."
opened: 2026-09-10T00:00:00Z
resolved: 2026-09-10T00:00:00Z
---

# B-050 — A verified coach who changes their email in Settings is sent straight back from the code screen

## What happens

`settings.profile` rule 9 says a new address is verified right away. On both web and iOS the
Settings save did get `emailVerification: "pending"` back from `PATCH /api/auth/me` and did
navigate to `/verify-email?next=/settings`. But `updateMe` only returns the new payload; it never
updates the signed-in user held in `AuthContext`. The verify screen reads that user
(`VerifyEmailPage.tsx`, `verify-email.tsx`), and when it still says `"verified"` it leaves at once
for `?next=`, which is Settings. The coach never sees the code screen; the server keeps the address
`pending`, so they are held on the code screen only at their next full load.

## Why nothing caught it

The seeded E2E coach starts `"unverified"` (no `email_verified_at`, verification not required). In
that state the verify screen does not leave: it auto-sends a code, and PAD-81's spec passed. The
bounce needs a coach who was already verified. PAD-139's password recovery correctly marks the
address verified ("the person just proved they own the address"), so in the 2026-09-10 batch,
with PAD-139's spec running before PAD-81's, PAD-81 failed. A Playwright trace showed the save
returning `"pending"`, `/me` before it saying `"verified"`, and the page never reaching
`/verify-email`.

## Fix

Web `SettingsPage.handleSave` and iOS `ProfileSection.handleSave` now `await refreshUser()` before
navigating to `/verify-email`, so the verify screen sees `"pending"`. A Playwright case in
`e2e/settings/profile-persistence.spec.ts` makes the coach verified first, changes the address and
asserts the code screen is reached, closing the seeded-unverified blind spot.
