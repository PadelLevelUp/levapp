---
id: import.coach-imports-a-roster-spreadsheet
status: implemented
implemented_by:
  - ../../specs/import/analyze.spec.md
  - ../../specs/import/preview.spec.md
  - ../../specs/import/confirm.spec.md
  - ../../specs/import/revert.spec.md
---

# Coach imports a roster spreadsheet

## Outcome

A coach who's been running their academy out of a spreadsheet doesn't have to re-type their whole
roster into LevelUp by hand. They upload the file, an AI reads its structure and figures out what's
players, what's classes, what's attendance and evaluation history, the coach reviews and adjusts
what got picked up, confirms, and everything lands in the system as real records — with the option
to undo the entire import if something went wrong.

## Who This Is For

A coach migrating an existing spreadsheet-based roster — players, classes, attendance history,
evaluations, coaching notes — into LevelUp for the first time, or bulk-adding a large batch of new
data at once.

## User Journey

1. The coach uploads their Excel file.
2. They watch the analysis happen live — the AI works through the file, identifying tables for
   players, classes, class/player associations, evaluation entries, and coach notes, and mapping
   spreadsheet columns onto the system's own fields.
3. Once analysis finishes, the coach sees a preview: each identified table, its columns, and its
   rows, each with a checkbox. They can deselect any row they don't want imported — a duplicate
   entry, a test row, whatever doesn't belong.
4. They confirm the import. Every selected record is created in the system, in the right order (so
   a class can reference a player that was just created, for example), and the coach sees a summary
   of what was added ("5 players, 2 classes").
5. If the coach realizes something's wrong — a bad mapping, duplicate data — they open their import
   history and revert the whole import, and everything it created disappears.

## Business Rules

- The AI's job is to propose a structure and a mapping; nothing is created in the system until the
  coach explicitly confirms.
- The coach can select or deselect individual rows before confirming — the import is never
  all-or-nothing at the row level.
- Records are created in an order that respects their dependencies (levels and evaluation
  categories before players, players before classes, classes before attendance and evaluation
  entries) so nothing references something that doesn't exist yet.
- Every record created by an import is tracked against that specific import, so it can be
  completely undone later, cleanly, without touching anything created outside of it.
- A reverted import is marked as reverted, not deleted from history — the coach can still see that
  it happened.

## Success Metrics

Not yet measured.

## Out of Scope

- Manually adding a single player or class outside of a bulk import — that's the ordinary
  player/class creation flow in the `players` and `classes` domains.
- Any file format other than the supported Excel structure the analyzer expects.

## Notes
- None.
