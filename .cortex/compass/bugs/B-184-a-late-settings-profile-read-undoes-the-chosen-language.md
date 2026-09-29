---
id: B-184
title: "Web Settings: a late profile read undid the language the coach had just chosen, and Save wrote the old one"
type: incomplete-rule
severity: medium
status: resolved
affects:
  - settings.language
  - frontend/apps/web/src/pages/SettingsPage.tsx
proposed_fix: "settings.language rule 7. The language state starts from the language the app is showing (not a hard 'pt'), and a languageDirty ref (like profileDirty) stops the mount-time read from overwriting a chosen language. Pinned by an E2E test that holds that read."
opened: 2026-09-25T11:58:16Z
resolved: 2026-09-25T12:09:46Z
---

# B-184: a late Settings profile read undid the chosen language

**Source:** the flake in `e2e/dashboard/dashboard-i18n.spec.ts` ("coach dashboard renders in Portuguese": the page was still in English at its PT greeting check). Found while adopting #428. Session-B confirmed it is not in the PAD-452 cross-spec family: it failed 1 time in 3 with the spec run alone, on an isolated DB, with `--workers=1`. Ticket PAD-453.

**What happens:** `SettingsPage` held `language` in state initialised to a hard `"pt"`, and its mount effect `getMe()` did `setLanguage(me.language)` and `i18n.changeLanguage(...)` unconditionally. For a coach whose language is English:
1. Before the read landed, the select showed "Português", which was not their language.
2. Choosing Portuguese was not a change (no `onValueChange`), so nothing recorded a choice.
3. The read landed and set `en`.
4. Save PATCHed `{"language":"en"}`, got a 200 and "Settings saved", and the app stayed in English.

Choosing a language that *was* a change was also overwritten by a late read, because the effect had no guard for the language. The profile fields already had one (`profileDirty`).

**What should happen:** the select shows the real current language, and a language the coach chose survives the page's own load.

**Root cause:** Type 2, an incomplete rule. `settings.language` rule 2 covers reading and updating the language, but nothing covered the order of the page's own read against the coach's choice. `profileDirty` settled that question for the profile fields and was never applied to the language.

**Evidence (Phase 1, 2026-09-25, isolated stack):**
- A probe held `GET /auth/me` after login. Portuguese was chosen at 5257 ms; the select held it until the read landed, then flipped to English (sampled at 9599 ms). The PATCH body was `{"language":"en"}` and the dashboard nav rendered "Dashboard".
- The control with no hold: both reads landed (965 and 1144 ms) before the choice (1293 ms). The PATCH body was `{"language":"pt"}` and the nav rendered "Painel".
- The flake's natural rate was about 1 in 3 under machine load, 0 in 4 on an idle box: the page's read only loses to the click when the backend is slow.

### Change Plan

**Spec:** `settings.language`. Add rule 7 and the criterion "A late profile read does not undo the chosen language (B-184)".
**Code:** `SettingsPage.tsx`. Initialise `language` from `i18n.language`, and add `languageDirty` (set in the select's `onValueChange`, checked by the mount handler).
**Test:** a new test in `e2e/settings/language-preference.spec.ts` that holds the page's mount read until after the choice and asserts the PATCH carries `pt`.

### Resolution

- Spec changes: `settings.language` rule 7 and a criterion.
- Test: `e2e/settings/language-preference.spec.ts`, "B-184: a late profile load does not overwrite the language just chosen". Both halves of the fix are needed; each 2×2 cell was run in a browser:
  - unfixed: red (PATCH `en`);
  - the guard alone: red (the `"pt"` default makes choosing Portuguese no change);
  - the initial value alone: red (the late read still overwrites);
  - both: green.
- Code changes: `SettingsPage.tsx` (initial language, `languageDirty`).
- iOS is not affected: `preferences-section.tsx` saves on tap with the tapped value (R-024 does not apply).
