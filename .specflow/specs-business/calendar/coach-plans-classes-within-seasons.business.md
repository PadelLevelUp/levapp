---
id: calendar.coach-plans-classes-within-seasons
status: implemented
implemented_by:
  - ../../specs/calendar/seasons.spec.md
---

# Coach Plans Classes Within Seasons

## Outcome

A coach defines their season once — "from 1 September to 31 July" — and it repeats every year on
its own. A recurring class can simply "run until the season ends" instead of carrying a hand-typed
end date, and the coach can read attendance and absences "for this season" without picking dates.
There is one season per coach, so "which season does this belong to" always has one answer.

## Who This Is For

Coaches planning a class's recurrence and reading attendance around their academy's season.

## User Journey

1. The coach opens Settings → Calendar and sets the season's start and end as a day and a month
   (no year), optionally giving it a name. A preview shows the dates of the season currently
   running or about to start.
2. When creating a recurring class, the coach can toggle "recurs until season end" instead of
   picking an end date; the class ends when the season it starts in ends.
3. If the class starts on a date the season does not cover (the summer break), the coach is told
   right there in the form — nothing is created with the wrong end date, and nothing typed is lost.
4. On a player's attendance or absence history, the coach picks "Season" to read the current
   season's numbers.
5. The coach can change the season in place — classes set to run until its end follow the new
   dates — or remove it.

## Business Rules

- A coach has at most one season, and it repeats every year.
- A recurring class set to "recurs until season end" ends with the season occurrence it starts in;
  if no season covers the start date, the class is not created at all.
- Changing the season moves the end of every class that runs until its end; removing the season
  leaves already-scheduled classes as they are.
- Seasons a coach had before this change are carried over silently: the most recent one becomes
  the recurring definition, and the originals are kept aside for support.

## Success Metrics

Not yet measured.

## Out of Scope

Recurrence mechanics themselves (`classes` domain). A per-coach season preset on the student's own
history (a student may have several coaches).

## Notes

PAD-82 replaced the previous model of several absolutely-dated, possibly overlapping seasons.
