# import — Bulk Data Import

## What this is

The spreadsheet-to-LevelUp migration path: a coach uploads a roster spreadsheet and an AI turns it
into real players, classes, associations, evaluations and notes in the system. Since 2026-11-05 it
also covers the same arrival done for the coach: the LevApp team loading a new coach's roster.

## What it covers

- `import.coach-imports-a-roster-spreadsheet` — the full analyze → preview → confirm → revert
  journey, end to end
- `import.team-onboards-a-new-coach-roster` — the team sets up a new coach's students and weekly
  classes for them, once, for that coach only, undoable, with no student contacted

## Why it's grouped this way

All four leaves are strictly sequential steps of one linear journey with a single persona (the
coach) and no natural branch point between them — analysis feeds the preview, the preview feeds
confirmation, and confirmation is what revert undoes. Splitting them into separate business specs
would fragment one continuous action into pieces nobody experiences independently.

The team-run setup is its own outcome because the person acting is different (a team member, not
the coach), and so are the promises: the right coach only, exactly once, nobody contacted.
