---
id: B-698
title: "On iOS, leaving Settings asked \"Descartar alterações?\" after the edit had been saved"
type: missing-criterion
severity: medium
status: resolved
affects:
  - settings.explicit-save
  - frontend/apps/mobile/app/settings.tsx
proposed_fix: "Pass headerLeft on both branches (undefined when nothing is held), so the native back returns after a save; add the criterion for it."
opened: 2026-10-28T18:44:00Z
resolved: 2026-10-28T19:00:00Z
---

# B-698: the discard question after a save

**Source:** the owner's report (Linear PAD-778): "Descartar alterações?" after saving, seen in Perfil.

**What happens:** a coach edits Perfil and taps Guardar, and the server confirms the save. Back on the
section list, the header back asks "Descartar alterações?" although nothing is held.

**What should happen:** once nothing is held, the header back is the native one and leaving asks
nothing (`settings.explicit-save` rule 5: the app's own back only while something is held).

**Root cause:** the rule is right, but no criterion covered what happens after a save. The screen passed
`...(hasUnsaved ? { headerLeft: … } : {})`. Screen options are merged into the ones already set, so
leaving the key out never removed the app's back. Once any section held an edit, the asking back stayed
for the rest of the visit, and its press opens the question every time. The unsaved registry itself was
clean: Secções did not ask.

**Evidence (2026-10-28, iPhone 17 Pro simulator, Maestro):**
- Perfil phone saved: `PATCH /api/auth/me` 200 at 18:43:34, and the API read the new value back.
- Secções did not ask. The header then showed `settings-header-back` instead of the native
  `BackButton`, and tapping it showed `settings-unsaved-dialog` (18:44:26Z).
- Ruled out by reading: every section re-bases its saved value on the server's answer, so none stays
  unsaved after a confirmed save. An earlier "dialog after Guardar" was an unsaved edit (the number pad
  covered Guardar, and no PATCH reached Flask).

**Fix:** `app/settings.tsx` passes `headerLeft` on both branches, `undefined` when nothing is held.
Web is untouched: web's leave guard reads the held state when the coach leaves, and has no header
button that can go stale. Tests: flow `309-settings-back-after-save-does-not-ask.yaml` (passes with the
fix, fails on staging's code at "settings-header-back is not visible"), and the wiring test in
`src/features/settings/explicit-save-guard.test.ts` (red without the fix).
