---
id: classes.student-joins-and-views-classes
status: draft
implemented_by:
  - ../../specs/classes/detail-visibility.spec.md
  - ../../specs/classes/join-requests.spec.md
---

# Student Joins And Views Classes

## Outcome

A student only ever sees their own information when looking at a class — never another
student's attendance, absences, or who else got invited — and, when they spot an open seat in a
class they're allowed to join, they can ask to attend it, with the coach deciding whether to let
them in.

## Who This Is For

Students/players looking at a class from the outside, and the coach who decides their requests.

## User Journey

1. A student opens a class they're part of and sees the essentials — time, level, coach, and
   their own attendance status — but nothing about classmates' attendance or who else was
   invited.
2. Browsing the calendar, the student notices a class with an open spot they're eligible for and
   asks to join.
3. The coach is notified of the request and accepts or rejects it.
4. If accepted, the student is enrolled in that occurrence just as if the coach had added them
   directly.
5. If someone else fills the spot first — through an invitation, the waiting list, or another
   request — the student's request is automatically closed, and depending on the coach's
   notification setting, they may be told automatically.
6. If rejected, the student is told and the spot stays open.

## Business Rules

- A student's view of a class never includes another student's participation, attendance, or
  invitation history.
- Only a student who is eligible and can see the open spot may request it; the system re-checks
  eligibility both when they ask and again when the coach decides.
- A student cannot request a class they are already enrolled in.
- A student can withdraw their own pending request without alerting the coach.
- The coach alone decides — accepting or rejecting a request is never automatic.
- First fill wins: whichever path — an accepted request, an accepted invitation, or a
  waiting-list placement — fills the spot first closes every other pending request for it.
- The coach is always told when a spot they were tracking requests for gets filled by someone
  else, regardless of whether the students are notified automatically.

## Success Metrics

Not yet measured.

## Out of Scope

How open spots become visible to students in the first place (`eligibility` domain); the
invitation engine that proactively solicits students (`notifications` domain).

## Notes

OPEN: privacy scoping (detail-visibility) and the self-service join flow (join-requests) are
grouped together here as "how a student experiences a class from the outside." They are
functionally distinct behaviours; if usage reveals they warrant separate treatment, split into
two specs later.
