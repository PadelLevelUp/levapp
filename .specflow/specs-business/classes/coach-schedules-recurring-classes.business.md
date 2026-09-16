---
id: classes.coach-schedules-recurring-classes
status: implemented
implemented_by:
  - ../../specs/classes/create.spec.md
  - ../../specs/classes/edit.spec.md
  - ../../specs/classes/delete.spec.md
  - ../../specs/classes/recurrence.spec.md
---

# Coach Schedules Recurring Classes

## Outcome

A coach can set up a class — one-off or recurring — choosing its type (a group academy class or
a private one-on-one lesson), capacity, and level, and later adjust or cancel it, including just
one occurrence of a recurring series, without disrupting the rest of the series.

## Who This Is For

Coaches who run padel lessons at a club and need to build and maintain their teaching schedule.

## User Journey

1. The coach opens the calendar and creates a new class: title, date/time, academy or private,
   level, and max players.
2. The coach decides whether it repeats weekly and on which days, and how long the series should
   run.
3. Later, the coach opens that class and changes something — a time, a title, a level — either
   for just one occurrence or for it and every future one.
4. When a class is no longer needed, the coach deletes it — either a single upcoming occurrence
   or the whole future series.
5. If the coach adjusts the weekly day, the schedule going forward reflects the new day.

## Business Rules

- A class is one-off or recurring; recurring classes repeat weekly on chosen days until an end
  date (or the coach's season end — see `calendar.coach-plans-classes-within-seasons`).
- A class is either an "academy" group class or a "private" one-on-one lesson.
- Editing or deleting always targets an explicit scope: just one occurrence, or that occurrence
  and every future one — the coach chooses.
- A recurring class stays one class through its edits: splitting it at a date, renaming it or
  removing one date never turns it into two unrelated classes in the coach's lists (PAD-275).
- Changing one occurrence never disturbs its siblings; only a future-scoped change ripples
  forward.
- Deleting a whole class removes every occurrence and any reminders still pending for it.

## Success Metrics

Not yet measured.

## Out of Scope

Who is enrolled or assigned to teach the class (`classes.coach-runs-class-occurrences`); how the
class is displayed or dragged around on the calendar (`calendar` domain).

## Notes

None.
