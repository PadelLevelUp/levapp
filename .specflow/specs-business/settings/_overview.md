# settings

## What this is

Business outcomes for the settings domain: personal profile and preferences, and role-scoped access to
club-wide configuration.

## What it covers

- `settings.coach-configures-preferences-and-access` — editing personal profile details, choosing a
  language, and the role-based split between per-user settings (everyone) and club-wide configuration
  (coach-only).

## Why it's grouped this way

All three leaves (profile, language, role-scope) describe one screen and one continuous journey: what
a user can edit about themselves, and which parts of that same screen they're allowed to see at all.
Role-scope isn't a separable outcome on its own — it only makes sense in the context of what's being
scoped (profile and language, plus the coach-only panels this domain gates access to) — so this 3-leaf
domain gets one business spec per the sizing guidance.
