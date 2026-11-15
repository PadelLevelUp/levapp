# import — Bulk Data Import

## What this is

The import domain.

## What it covers

- `import.analyze` — implemented
- `import.preview` — implemented
- `import.confirm` — implemented
- `import.revert` — implemented
- `import.onboarding-runner` — implemented (PAD-827): the team's `flask onboarding` command that loads a new coach's students, classes and enrolments from a data file, once, revertibly

## Why it's grouped this way

One domain of the LevelUp product, migrated 2026-09-03 from the legacy `specs/import/spec.md` (one file per domain) into one leaf per behaviour. Leaves sit directly under the domain — no capability folders yet.

`import.onboarding-runner` (2026-11-05) is the same destination by another road: the team loads a roster for the coach from the server, reusing `import.confirm`'s player creation and `import.revert`'s undo, and records the run in the same history.
