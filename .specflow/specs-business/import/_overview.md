# import — Bulk Data Import

## What this is

The spreadsheet-to-LevelUp migration path: a coach uploads a roster spreadsheet and an AI turns it
into real players, classes, associations, evaluations and notes in the system.

## What it covers

- `import.coach-imports-a-roster-spreadsheet` — the full analyze → preview → confirm → revert
  journey, end to end

## Why it's grouped this way

All four leaves are strictly sequential steps of one linear journey with a single persona (the
coach) and no natural branch point between them — analysis feeds the preview, the preview feeds
confirmation, and confirmation is what revert undoes. Splitting them into separate business specs
would fragment one continuous action into pieces nobody experiences independently.
