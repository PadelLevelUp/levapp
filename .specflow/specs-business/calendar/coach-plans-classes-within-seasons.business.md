---
id: calendar.coach-plans-classes-within-seasons
status: implemented
implemented_by:
  - ../../specs/calendar/seasons.spec.md
---

# Coach Plans Classes Within Seasons

## Outcome

A coach defines named seasons — a name plus a start and end date — in settings, and can set a
recurring class to simply "run until the season ends" instead of typing a specific end date by
hand; the system keeps the coach's seasons from silently overlapping or disappearing.

## Who This Is For

Coaches planning a class's recurrence around their club's season calendar.

## User Journey

1. The coach opens Settings → Calendar and defines a season with a name and date range.
2. When creating a recurring class, the coach can toggle "recurs until season end" instead of
   picking an end date.
3. If no season covers the class's start date, the coach is told right there in the form — the
   class isn't silently created with the wrong end date, and nothing typed into the form is lost.
4. The coach can later edit a season's dates in place, or delete it explicitly; anything not
   mentioned in a save is left alone.

## Business Rules

- A coach's seasons must never overlap each other.
- Saving seasons never silently deletes one that isn't part of the payload — removing a season is
  always an explicit, separate action.
- A recurring class set to "recurs until season end" is bounded by that season's end date; if no
  season covers the start date, the class is not created at all.

## Success Metrics

Not yet measured.

## Out of Scope

Recurrence mechanics themselves (`classes` domain).

## Notes

None.
