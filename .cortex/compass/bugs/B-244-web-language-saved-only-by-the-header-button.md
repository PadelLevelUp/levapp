---
id: B-244
title: "Web Settings: a language picked on Preferences is not stored unless the page-header Save is pressed"
type: layer-drift
severity: medium
status: triaged
affects:
  - settings.language
  - settings.unsaved-edits
  - settings.save-on-change
  - frontend/apps/web/src/pages/SettingsPage.tsx
proposed_fix: "Web saves the chosen language on change, as iOS does; the page-header Save shows only on tabs holding explicit-save fields."
opened: 2026-10-02T08:53:08Z
---

# B-244: web Language rides the header Save button

**Source:** PAD-473 survey (Session-C, 2026-10-01), reproduced 2026-10-02.

**What happens:** on web, the language select on Settings → Preferences only changes local state and
i18n (`SettingsPage.tsx` `onValueChange`, ~:663); the language reaches the server only inside
`handleSave` (~:444), the page-header "Guardar alterações" button, which also shows on Preferences next
to settings that save on their own. A coach who picks a language and leaves loses it on the next
login. iOS saves the language on change.

**Evidence:** Playwright probe on an isolated stack: coach on `en`, picked `pt` on Preferences, no Save
click, opened Players, reloaded: `GET /api/auth/me` still `en`, and no write to `/api/auth/me` was sent.

**Root cause:** `settings.unsaved-edits` rule 1 already lists language among the sections that "save on
every change", and `settings.language` rule 7 describes web saving through Save: the two dev specs
disagree, and the web code follows rule 7. Type 6, layer drift.

### Change Plan
- Spec: `settings.language` rule 7 + the B-184 criterion reworded (web saves on change; the late-read
  guard stays); `settings.save-on-change` rules 1 and 4.
- Web: save on change through `updateMe({ language })` with the shared sign; failure returns to the last
  confirmed language; the header button renders only on the Profile tab; `handleSave`'s payload is
  unchanged. e2e `settings/language-preference.spec.ts:146` stops clicking the header Save.

### Resolution
_Pending (PAD-473 PR 2)._
