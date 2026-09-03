---
id: eligibility.student-discovers-open-spots
status: draft
implemented_by:
  - ../../specs/eligibility/open-spot-visibility.spec.md
---

# Student discovers open spots

## Outcome

A student can spot a class they could join right inside the calendar they already use — no
separate browse screen — but only if their coach has chosen to advertise it, and only for classes
they're actually eligible for. It shows up as visually distinct from their own enrolled classes, so
there's no confusion about which is which.

## Who This Is For

A student who wants to find a class with room, on their own initiative, without waiting to be
invited — and a coach deciding whether they want their open spots advertised at all.

## User Journey

1. A coach who wants students to be able to find open spots on their own turns on "make empty spots
   visible" — either as their standard, or for just one recurring class or occurrence.
2. A student who's eligible for that class opens their calendar and sees it appear alongside their
   own enrolled classes, but in a distinctly different color, clearly marked as a spot they could
   join rather than one they're already in.
3. A student who isn't eligible for that class — too far below its level, say — never sees it at
   all; visibility and eligibility are checked together.
4. A class that's already full, already happened, or been canceled never shows up as an open spot,
   whether or not visibility is on.
5. If a coach hasn't turned visibility on anywhere, nothing changes for their students — the
   calendar shows exactly the classes they're enrolled in, same as always.

## Business Rules

- Visibility is a coach-controlled toggle, and it cascades the same way the eligibility bar itself
  does: a coach standard, overridable per recurring series and per single occurrence, most specific
  wins.
- A class only ever counts as "open" if it genuinely has room — the same capacity measure the rest
  of the calendar already uses, whether or not that occurrence has been created as a concrete
  record yet.
- A student only ever sees open spots for a coach they're already on the roster of — this never
  surfaces another coach's classes.
- A student's own availability preferences (blocking certain hours) hide them from being *solicited*
  about a class, but never hide the class from their own discovery — since here the student is the
  one initiating.
- Looking at the calendar never creates anything — no class record is materialized and no data
  changes just because a student looked.

## Success Metrics

Not yet measured.

## Out of Scope

- Requesting to join, or being enrolled — this outcome covers discovery only; the join mechanism
  itself lives in the `classes` domain.
- Whether the student is actually eligible — that's decided by the bar the coach set, see "Coach
  sets the eligibility bar".

## Notes
- None.
