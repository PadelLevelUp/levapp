---
id: classes.student-books-a-class
status: draft
implemented_by:
  - ../../specs/classes/class-requests.spec.md
  - ../../specs/classes/availability.spec.md
---

# Student Books A Class

## Outcome

A student can ask their coach for a class at a time the coach is actually free, and the coach
can say yes, say no, or propose another time — so scheduling runs both ways instead of the
coach always being the one who opens the calendar.

## Who This Is For

Students who want a class outside the coach's published schedule, and the coach who decides.

## User Journey

1. From their Availability tab ("Disponibilidade") the student taps "Marcar Aula", picks one of
   their coaches, and chooses a private class (or, in the sibling journey, joining an academy
   class).
2. The student says how many people are coming, one to four. For more than one, they name the
   others by username; only players who already train with that coach can be named, and the
   wizard says so.
3. The student chooses a single class, or a weekly one on chosen weekdays between a start and an
   end date.
4. The student picks a duration and sees the times that are actually free: the coach's working
   time minus the coach's classes and blocks, minus the times the student and the named players
   are already busy or have marked themselves unavailable. For a weekly class only times free on
   every chosen weekday of every week in the range are shown, so the whole series fits.
5. The student picks a start time, adds an optional note, and sends the request; it shows as
   "À espera do treinador" with a withdraw action.
6. The slot (every occurrence, for a weekly request) is held on the coach's calendar while the
   request is pending, so nobody else can ask for the same time.
7. The coach accepts (the class — or the whole weekly series — is created with everyone in it
   and the named players are told they were added), declines, or proposes a different time.
8. A proposed time goes back to the student, who accepts it, declines it, or proposes another
   time — and the coach answers again, as many rounds as it takes.
9. Both sides are told in chat at every step, and the message that asks a question can be
   answered right there.

## Business Rules

- The coach's working time is declared by the coach in Settings, per weekday; until they do,
  the club's day (08:00–22:00) counts as working time and the wizard says it is assuming that.
- Free is what working time leaves after everything already on the calendars involved: the
  coach's classes and blocks, and the busy time and unavailability of every person who would be
  in the class.
- A weekly request is one request; the coach's approval creates one weekly class series with
  the given end date, never a scatter of one-offs.
- The people named by the student do not accept anything; the coach's approval enrols them and
  they are told they were added, like any student a coach puts in a class.
- A pending request holds its slot on the coach's calendar; the hold disappears the moment the
  request is decided or withdrawn. If the coach has renamed that hold, it has become the coach's
  own event: it stays on the calendar when the request closes.
- Only the coach can book the class or refuse the request outright; either side may propose
  another time, and the other side always gets to answer.
- Every state change — new request, accepted, declined, counter-proposed, proposal answered,
  withdrawn — reaches the other side through the existing notification channels.

## Success Metrics

Not yet measured.

## Out of Scope

Paying for the class; naming players who do not train with the chosen coach (there is no
player-to-player connection in the product — decision 2026-09-06); joining an academy class
(the sibling journey, `student-joins-and-views-classes`).
