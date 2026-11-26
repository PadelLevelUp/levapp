---
constants:
  BLOCKER_COVERED_HORIZON_DAYS: 92
  BLOCKER_DECLINE_MAX_ENTRIES: 200
---

# calendar constants

- `BLOCKER_COVERED_HORIZON_DAYS`: how far ahead, counted from the block's first occurrence, a student's availability
  block looks for the classes it covers (`calendar.student-blockers` rules 19–22). It equals the
  three months the block sheet gives a recurring block saved with no end date
  (`calendar.student-blockers` rule 16), so a block made in the sheet is asked about whole and only
  a block with no end is cut. The covered-classes listing and the mark's re-check use the same value.
- `BLOCKER_DECLINE_MAX_ENTRIES`: the most classes one `decline_covered` call may ask about
  (`calendar.student-blockers` rule 22). The listing is capped by the horizon, and a block of three months
  on a few classes a week is well below it; a longer list is a client bug, refused with 400.
