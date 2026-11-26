---
constants:
  BLOCKER_COVERED_HORIZON_DAYS: 92
  BLOCKER_DECLINE_MAX_ENTRIES: 200
---

# calendar constants

- `BLOCKER_COVERED_HORIZON_DAYS`: how far ahead, counted from the block's first occurrence, a student's availability
  block looks for the classes it covers and marks "Não vai" when it is saved (`calendar.student-blockers`
  rules 19–22, 25). It equals the three months the block sheet gives a recurring block saved with no
  end date (`calendar.student-blockers` rule 16), so a block made in the sheet is marked whole and only
  a longer or endless block is cut. The save's marks and the legacy mark call's re-check use the same value.
- `BLOCKER_DECLINE_MAX_ENTRIES`: the most classes one legacy `decline_covered` call may list
  (`calendar.student-blockers` rule 25). A save's own marks are bounded by the horizon, not by this; a
  longer list is a client bug, refused with 400.
