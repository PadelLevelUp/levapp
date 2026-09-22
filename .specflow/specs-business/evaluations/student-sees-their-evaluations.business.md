---
id: evaluations.student-sees-their-evaluations
status: draft
implemented_by:
  - ../../specs/evaluations/student-view.spec.md
provenance:
  - derives_from: archive/documents/sistema-de-avaliacoes-2026-09-21/extracted/requirements.md
  - derives_from: archive/documents/sistema-de-avaliacoes-explained-2026-09-21/extracted/summary.md
---

# Student Sees Their Evaluations

## Outcome

A player can see what their coach chose to show them about how they are doing, in one place, and
go back to it.

**Decided by the owner on 2026-09-22 (PAD-402, Q2):** the player's side is a section on their
dashboard, on web and iOS. The owner's canvas shows only the coach's preview, and today a player
sees no evaluation anywhere.

## Who This Is For

Players (students). A player with more than one coach sees each coach's evaluations, each named.

## User Journey

1. The player gets a message in their conversation saying their coach shared an evaluation (no
   phone or browser notification).
2. Their dashboard shows the newest shared evaluations, with a way to the full list.
3. Each card names the coach and the date, and shows the competencies the coach chose with their
   scores, how they have moved, and the coach's comment if the coach included it.

## Business Rules

1. A player sees only what was shared, exactly as the coach previewed it.
2. A player sees nothing of an evaluation that was not shared, and no figure worked out from
   parts they were not shown.
3. A player with nothing shared sees no evaluations section at all — not an empty one.
4. A player cannot rate, reply to or remove an evaluation; the one action is opening the
   conversation with the coach.
5. Players on an App Store version from before this feature are not shown the dashboard section
   and nothing breaks for them; they still get the message.

## Success Metrics

Not yet measured. Candidate: the share of shared cards opened within 7 days.

## Out of Scope

A player profile page, which does not exist on web or iOS. Anything not shared.

## Notes

- Owner answer of 2026-09-22 (Q2): the player sees only what a coach shares, on their dashboard,
  web and iOS; App Store builds from before the feature are not shown the section.
