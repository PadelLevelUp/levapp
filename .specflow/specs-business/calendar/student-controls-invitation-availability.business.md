---
id: calendar.student-controls-invitation-availability
status: draft
implemented_by:
  - ../../specs/calendar/student-blockers.spec.md
---

# Student Controls Invitation Availability

## Outcome

A student marks out times they're unavailable so the smart invitation system stops trying to
reach them during those windows — and, when relevant, warns the coach before they get enrolled
into a class that clashes.

## Who This Is For

Students/players who want to stop receiving class invitations during times they can't play; the
coach is warned when scheduling around a student's blocker.

## User Journey

1. The student opens their availability page and adds a one-time or recurring window when they
   can't play.
2. From then on, the automatic invitation engine skips them for any class overlapping that
   window.
3. If a coach tries to schedule or manually add the student into a class inside a blocked window,
   the coach sees a warning naming the student before proceeding.
4. The student never receives a notification for a class that conflicts with a time they marked
   unavailable.

## Business Rules

- A blocker suppresses automatic invitations to the student for any class overlapping its
  window.
- (Specced, not yet fully shipped) a blocker is meant to suppress every kind of class-slot
  solicitation — automatic invitations, manual invitations, reminders, and waiting-list offers —
  not automatic invitations alone.
- A coach can still choose to enroll a blocked student by hand, but only after explicitly
  confirming a warning; the student is never told about that manual addition.
- The coach only ever sees that a student is unavailable at a given time — never the blocker's
  title, description, or reason.

## Success Metrics

Not yet measured.

## Out of Scope

A coach's own personal time blocks (`calendar.coach-blocks-personal-time`).

## Notes

OPEN: per the `calendar.student-blockers` leaf's own status note, only the CRUD and
automatic-invitation-filtering half of this outcome (PAD-28) is actually shipped; the send-time
blocking, scheduling warning, and hard delivery backstop (PAD-107) are specced but not
implemented. The business rules above describe the intended full outcome — flag to stakeholders
that part of it is not yet real.
