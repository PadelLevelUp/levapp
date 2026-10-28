---
id: B-691
title: "The coach's participants header counted not-coming students, so a class with 4 free spots read 16/16"
type: incomplete-rule
severity: medium
status: resolved
affects:
  - calendar.event-detail
  - frontend/apps/web/src/components/calendar/ClassDetailSheet.tsx
  - frontend/apps/mobile/app/class/[id].tsx
  - frontend/packages/config/src/capacity.ts
proposed_fix: "Rule 5's named exception: the header reads 'X/M · K vagas' (X = effectiveFilledSpots, K = M - X) or 'X/M · completa', from one shared helper on web and iOS."
opened: 2026-10-28T12:00:00Z
resolved: 2026-10-28T14:00:00Z
---

# B-691: the participants header counted not-coming students

**Source:** the owner's report of 27/10 (Linear PAD-771), a coach's class of capacity 16. The
coordinator approved the rule text on 2026-10-28; the owner may veto.

**What happens:** the class had 16 enrolled, 4 of them not coming. The coach's participants
header read "16/16 inscritos", so the class looked full while it had 4 free spots.

**What should happen:** the header counts the filled spots (going plus not yet answered), shows
the capacity and names the open spots: "12/16 · 4 vagas", or "16/16 · completa".

**Root cause:** calendar.event-detail rule 5's PAD-659 exception (2026-10-14) defined the header
as every enrolled row over the capacity, not-coming students included. The rule did not cover a
coach reading the header as how full the class is. The engine's own count was already correct:
`LessonInstance.effective_filled_spots` leaves absent students out, and every capacity check
reads it.

**Fix:** rule 5's exception replaced, one criterion updated and one added.
`participantsHeader(filled, max)` in `@levelup/config` feeds web and iOS. Tests:
`capacity.test.ts`, `ClassDetailSheet.header.test.tsx`, `participant-groups-render.test.tsx`.

**Not covered here:** why the 27/10 class's remaining spots invited nobody after one accept is an
engine question waiting on a prod read. If that is a defect, it gets its own ticket and id.
