# settings — User Preferences & Internationalization

## What this is

The settings domain.

## What it covers

- `settings.language` — draft
- `settings.profile` — implemented
- `settings.role-scope` — implemented
- `settings.admin-editor` — retired (owner, 2026-10-07: PAD-532 removes the `/editor` data browser with the Settings → Admin tab; routine operations move to the staff console `admin/` of PAD-530. Was PAD-175 / PAD-267: superadmin-only, secrets redacted, web-only)
- `settings.coach-working-hours` — draft (PAD-357: a coach's declared weekly working time, read by `classes.availability`)
- `settings.tutorials` — implemented — the coach-only Tutorials section and its first walkthrough,
  "Understand invites" (data from `notifications.invite-simulation`)
- `settings.unsaved-edits` — implemented (PAD-394 / B-157: leaving a section with unsaved edits asks "Descartar alterações?"; warn, not hold)
- `settings.explicit-save` — implementing (PAD-506: nothing in Settings is saved until the tab's one "Guardar alterações"; leaving with unsaved edits asks. Replaced PAD-473's save-on-change, whose spec was retired)

## Why it's grouped this way

One domain of the LevelUp product, migrated 2026-09-03 from the legacy `specs/settings/spec.md` (one file per domain) into one leaf per behaviour. Leaves sit directly under the domain — no capability folders yet.

`settings.tutorials` lives here because it is a Settings section gated by `settings.role-scope`,
but it implements a **notifications** business outcome (`coach-understands-who-gets-invited`): the
screen is settings furniture, the value is understanding the invitation engine.
