---
id: calendar.coach-views-and-manages-schedule
status: implemented
implemented_by:
  - ../../specs/calendar/view.spec.md
  - ../../specs/calendar/event-detail.spec.md
  - ../../specs/calendar/drag-drop.spec.md
  - ../../specs/calendar/slot-click.spec.md
  - ../../specs/calendar/mobile-views.spec.md
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
   is. On a phone (the web app on a phone, and the iOS app) the coach picks between a day, a
   week and a month view; whichever they pick, the day they have selected is always detailed
   below — its date, how many classes, and a card per class or block — and that detail slides
   up over the week or month grid as a sheet.
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
- The colour a coach picks for a class identifies that class and nothing else; what a class is
  *doing* is carried by its treatment — filled when upcoming, outlined when it is the next one,
  faded when finished, red when canceled, dashed when it is a personal block rather than a
  class. Amber appears only on the seat count of a class that still has empty seats. The colours
  a coach may pick therefore never include an amber, red or green.

## Success Metrics

Not yet measured.

## Out of Scope

Creating or editing classes themselves as data (`classes` domain); personal availability blocks
(`calendar.coach-blocks-personal-time`); marking attendance (`attendance` domain).

## Notes

- **[DEC 2026-09-04, PAD-170 C4]** iOS gets the same colour legend web already has, as a legend
  row under the week nav — decided to port it rather than decline it as a phone-toolbar surface,
  sequenced after PAD-172's 50/50 split lands. Shipped in PAD-170; see `calendar.view` rule 13.
- **[DEC 2026-09-08, mobile calendar restyle]** The phone calendar follows the owner's
  2026-09-08 design canvas (Dia / Semana / Mês). Decided with the owner while ingesting it: the
  coach's colour stays as the class identity and is shown solid / faded / as an outline by
  state; the pickable palette loses amber, red and green and existing classes are remapped
  once; red means canceled; the legend goes on phones; add controls become floating buttons on
  both shells; students get the same views; the web phone header stays as it is. See
  `calendar.mobile-views` and the archive entry `2026-09-08-mobile-calendar-design`.
