---
id: calendar.coach-blocks-personal-time
status: implemented
implemented_by:
  - ../../specs/calendar/blocks.spec.md
---

# Coach Blocks Personal Time

## Outcome

A coach can mark out personal time — a break, holiday, day off, or other personal commitment —
on their calendar so it's visible alongside their classes, optionally with a rule that suppresses
automatic class invitations to themself during that window.

## Who This Is For

Coaches managing their own personal time on the calendar.

## User Journey

1. The coach creates a block for a range of time — one-off or recurring — labeling it as a break,
   holiday, day off, or personal commitment.
2. The block appears on the calendar next to their classes.
3. If needed, the coach reschedules the block, either just once or for every future occurrence.

## Business Rules

- A block has a type: break, holiday, off-work, personal, or unavailable.
- Blocks can recur, using the same weekly recurrence machinery as classes.
- A block can optionally suppress automatic invitations sent to its owner during its window.

## Success Metrics

Not yet measured.

## Out of Scope

A student blocking their own availability so they aren't invited to classes
(`calendar.student-controls-invitation-availability`) — a different persona and purpose, even
though it reuses the same underlying record type.

## Notes

None.
