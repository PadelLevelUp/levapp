# settings — User Preferences & Internationalization

## What this is

The settings domain.

## What it covers

- `settings.language` — draft
- `settings.profile` — implemented
- `settings.role-scope` — implemented
- `settings.admin-editor` — implemented (PAD-175 / PAD-267: the superadmin's data browser — switched on per environment, superadmin-only, secrets redacted; web-only)
- `settings.tutorials` — implemented — the coach-only Tutorials section and its first walkthrough,
  "Understand invites" (data from `notifications.invite-simulation`)

## Why it's grouped this way

One domain of the LevelUp product, migrated 2026-09-03 from the legacy `specs/settings/spec.md` (one file per domain) into one leaf per behaviour. Leaves sit directly under the domain — no capability folders yet.

`settings.tutorials` lives here because it is a Settings section gated by `settings.role-scope`,
but it implements a **notifications** business outcome (`coach-understands-who-gets-invited`): the
screen is settings furniture, the value is understanding the invitation engine.
