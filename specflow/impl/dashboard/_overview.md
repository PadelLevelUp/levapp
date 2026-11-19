# dashboard — Dynamic Dashboard

## What this is

The dashboard domain.

## What it covers

- `dashboard.blocks` — implemented
- `dashboard.navigation` — implemented
- `dashboard.profile-completeness` — implementing: the coach's "incomplete profiles" block and the student's "profile incomplete" card with a once-a-day reminder (PAD-486, PAD-490)
- `dashboard.student-setup-guide` — draft: the student's five-step setup guide on first login and its unavailability schedule editor (PAD-839)

## Why it's grouped this way

One domain of the LevelUp product, migrated 2026-09-03 from the legacy `specs/dashboard/spec.md` (one file per domain) into one leaf per behaviour. Leaves sit directly under the domain — no capability folders yet.
