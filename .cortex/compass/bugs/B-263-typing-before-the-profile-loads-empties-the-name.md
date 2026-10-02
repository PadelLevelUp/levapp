---
id: B-263
title: "Settings → Perfil: typing before the profile had loaded left the other fields empty, and the save was refused for a blank name"
type: incomplete-rule
severity: medium
status: resolved
opened: 2026-10-02T16:11:56Z
resolved: 2026-10-02T16:11:56Z
updated: 2026-10-02T16:11:56Z
affects:
  - settings.profile
  - frontend/apps/web/src/pages/SettingsPage.tsx
  - frontend/apps/mobile/src/features/settings/profile-section.tsx
proposed_fix: "Hydrate per field: a late /auth/me fills every field the coach has not touched and keeps what they typed in the ones they did."
---

# B-263: an early keystroke stopped the whole profile form from loading

**Source:** PAD-482. Its "Adicionar email" opens Perfil with the email field focused, which sends a
coach straight into this; the PR's first Playwright run hit it.

**What happens:** the profile form is hydrated from `GET /auth/me`. One flag for the whole form
(web `profileDirty`, `SettingsPage.tsx:435/479`; iOS `dirtyRef`, `profile-section.tsx:93/99`) was set by
the first keystroke in ANY field, and hydration was skipped while it was set. A coach who typed an email
before the read landed kept an empty name, abbreviation and phone. Save sends every field that differs
from the saved copy, so it sent `name: ""`, the server refused the blank name, and the coach saw "could
not save" with nothing changed.

**Evidence:** PAD-482 Playwright run 1 (2026-10-02 ~16:50 UTC): Name empty after typing the email, save
refused (screenshot in the run's test-results). Unit tests on both clients with `getMe` held until after
the typing: red on staging 193430632.

**Root cause (diagnostic tree):** `settings.profile` rule 8 says the form is hydrated from `/auth/me` but
not what happens to a field the coach edits before that read lands. Type 2, incomplete rule.

### Change Plan
- Spec: `settings.profile` rule 8: a late read fills every untouched field; touched fields keep
  what was typed.
- Code: per-field "touched" sets on web and iOS, cleared by a successful save.

### Resolution (PAD-482)

- **Spec:** `settings.profile` rule 8 gains the sentence above.
- **Code:** web `SettingsPage.tsx` `profileTouched` + `hydrateUntouched`; iOS `profile-section.tsx`
  `touchedRef`. A save clears the set.
- **Tests:**
  - `SettingsPage.test.tsx` and `profile-section.test.tsx` ("typing before the profile has loaded"):
    the untouched name fills in, and the save sends only the typed email.
  - `pad482-email-prompt.spec.ts` holds Settings' `GET /auth/me` until the email is typed. It fails on the
    old code (Name "" instead of "E2E Coach") and passes on the fix.
