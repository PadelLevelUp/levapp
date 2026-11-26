---
constants:
  BLOCKER_COVERED_HORIZON_DAYS: 92
---

# calendar constants

- `BLOCKER_COVERED_HORIZON_DAYS`: how far ahead, counted from the block's first occurrence, a student's availability
  block looks for the classes it covers (`calendar.student-blockers` rules 19–22). It equals the
  three months the block sheet gives a recurring block saved with no end date
  (`calendar.student-blockers` rule 16), so a block made in the sheet is asked about whole and only
  a block with no end is cut. The covered-classes listing and the mark's re-check use the same value.
