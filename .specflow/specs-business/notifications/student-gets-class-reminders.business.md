---
id: notifications.student-gets-class-reminders
status: implemented
implemented_by:
  - ../../specs/notifications/reminders.spec.md
  - ../../specs/notifications/class-reminders-manual.spec.md
---

# Student gets class reminders

## Outcome

A student never has to remember on their own whether they're playing tomorrow. Ahead of every
class, they get a reminder — automatically, on the coach's configured schedule, or on demand when
the coach sends one manually — and a simple Yes/No to confirm or cancel their spot. Answering is
safe to do more than once, an old reminder never lingers with live buttons once a newer one has
been sent or the class has already happened, and a genuine "no" opens the spot up for someone else.

## Who This Is For

A student enrolled in a coach's classes, and the coach who wants confirmed attendance without
chasing people individually.

## User Journey

1. Ahead of a class, on the coach's configured timing (e.g. 24 hours before), the student receives
   a reminder message in their chat with the coach, plus a push notification.
2. They tap Yes to confirm they're coming, or No to cancel their spot.
3. If they cancel, their spot opens up — the coach's invitation engine (or the coach directly) can
   now offer it to someone else.
4. If the coach wants a reminder sent right now, outside the normal schedule — a last-minute
   roster check, say — they trigger it manually for that class, and every enrolled student gets the
   same reminder immediately.
5. If a student is slow to answer and a second reminder goes out for the same class, their first
   reminder's buttons quietly stop working — only the newest reminder is live, so they always know
   which one to act on.
6. If they try to answer a reminder for a class that has already started or finished, nothing
   happens to their attendance record — the reminder simply shows as expired.

## Business Rules

- Every enrolled student gets a reminder; a decline can immediately hand the spot to the automatic
  invitation engine, unless the coach has semi-automatic approval turned on.
- Answering twice with the same answer is harmless — it never sends a second confirmation message
  or opens a second replacement round. Changing your answer (no, then yes) always goes through.
- Once a class has started or been canceled or completed, no reminder for it can still change
  anything — attendance for a class that already happened is the coach's own record, not something
  a late tap can override.
- When a newer reminder is sent for the same class, any earlier unanswered reminder for that same
  student stops being answerable — there is never more than one live "are you coming?" prompt per
  student per class at a time.
- A manually-triggered reminder uses the exact same delivery and response flow as an automatic one
  — a student can't tell the difference except in timing.
- A student's answer is always saved, even the very first time they've ever responded to anything —
  there's no silent case where an answer is received but not recorded.

## Success Metrics

Not yet measured.

## Out of Scope

- What happens once a "no" opens a spot — that's "Coach fills vacancies automatically" (and, for
  semi-automatic coaches, "Coach approves replacements").
- The reminder's wording and timing configuration — see "Coach tunes the invitation engine".
- A student muting reminders entirely — see "Student controls their notifications".

## Notes

- None.
