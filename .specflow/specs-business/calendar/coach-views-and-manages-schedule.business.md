---
id: calendar.coach-views-and-manages-schedule
status: implemented
implemented_by:
  - ../../specs/calendar/view.spec.md
  - ../../specs/calendar/event-detail.spec.md
  - ../../specs/calendar/drag-drop.spec.md
  - ../../specs/calendar/slot-click.spec.md
---

# Coach Views And Manages Schedule

## Outcome

The coach has one weekly calendar showing every class and personal block, can click into any
event for full detail and actions, drag events to a new day or time, and click or drag across
empty slots to create a new class already pre-filled with that date and time.

## Who This Is For

Coaches viewing and adjusting their week. (Students see a read-only version, scoped to their own
classes — see `classes.student-joins-and-views-classes`.)

## User Journey

1. The coach opens the calendar and sees the week's classes and blocks, each showing how full it
   is.
2. Clicking a class opens its full detail — participants, attendance, and actions like edit,
   delete, or notify.
3. The coach drags a class or block to a new day/time and confirms whether the change applies to
   just that occurrence or the whole future series.
4. The coach clicks — or drags across — an empty stretch of the calendar to open a pre-filled
   "new class" form for that date and time range.
5. A class that has already ended shows as completed; an upcoming one shows as scheduled.

## Business Rules

- The number shown on a class ("X/Y") always reflects seats actually filled — a student who
  declined no longer counts, but one who simply hasn't answered yet still does.
- A class is "completed" once its end time has passed, not just its date — a class that ended
  earlier today reads the same as one from last week.
- Dragging a recurring event asks whether the change is for just that occurrence or every future
  one, same as editing by hand.
- Creating from an empty-slot click or drag is available to coaches only, and is desktop-only —
  dragging isn't supported on touch/mobile.
- A student who received several invitations for the same class appears once in the guest list,
  never once per invitation.

## Success Metrics

Not yet measured.

## Out of Scope

Creating or editing classes themselves as data (`classes` domain); personal availability blocks
(`calendar.coach-blocks-personal-time`); marking attendance (`attendance` domain).

## Notes

None.
