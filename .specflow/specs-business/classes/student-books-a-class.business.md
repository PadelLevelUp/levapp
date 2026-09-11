---
id: classes.student-books-a-class
status: draft
implemented_by:
  - ../../specs/classes/class-requests.spec.md
---

# Student Books A Class

## Outcome

A student can ask their coach for a class at a time the coach is actually free, and the coach
can say yes, say no, or propose another time — so scheduling runs both ways instead of the
coach always being the one who opens the calendar.

## Who This Is For

Students who want a class outside the coach's published schedule, and the coach who decides.

## User Journey

1. From their Availability tab the student taps "Book a class", picks one of their coaches, and
   sees that coach's free time — anything the coach has not marked busy (a class or a calendar
   block) counts as free.
2. The student picks a free slot and sends the request.
3. The slot is held on the coach's calendar while the request is pending, so nobody else can
   ask for the same time.
4. The coach accepts (the class is created with the student in it), declines, or proposes a
   different time.
5. A proposed time goes back to the student, who accepts it, declines it, or proposes another
   time — and the coach answers again, as many rounds as it takes.
6. Both sides are told in chat at every step, and the message that asks a question can be
   answered right there.

## Business Rules

- The coach's availability is inferred, never declared: busy is what the calendar shows, free is
  everything else inside the day.
- A pending request holds its slot on the coach's calendar; the hold disappears the moment the
  request is decided or withdrawn.
- Only the coach can book the class or refuse the request outright; either side may propose
  another time, and the other side always gets to answer.
- Every state change — new request, accepted, declined, counter-proposed, proposal answered,
  withdrawn — reaches the other side through the existing notification channels.

## Success Metrics

Not yet measured.

## Out of Scope

Positive availability management by the coach (declared working hours); paying for the class;
group requests.
