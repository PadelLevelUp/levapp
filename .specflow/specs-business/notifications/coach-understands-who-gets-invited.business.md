---
id: notifications.coach-understands-who-gets-invited
status: draft
implemented_by:
  - ../../specs/notifications/invite-simulation.spec.md
  - ../../specs/settings/tutorials.spec.md
---

# Coach understands who gets invited

## Outcome

The automatic invitation engine stops being a black box. From a new **Tutorials** area in
Settings, a coach can pick any upcoming class, pick one of its enrolled players as "the one who
cancels", and see exactly who the engine would invite right now, in what order, and why — round by
round, with the ranking values that put each student where they are, and whether each would be
contacted in the first batch or has to wait. The coach can also ask about any specific student who
is *not* on that list and get the one reason they were left out, in the same words the app already
uses when it warns about an ineligible student.

Nothing is sent, nobody is placed, no spot is opened: it is a rehearsal, and the coach can run it as
often as they like.

## Who This Is For

A coach who has configured (or inherited the defaults of) the invitation engine and gets asked by
students — or asks themselves — "why was Maria invited and not João?".

## User Journey

1. The coach opens Settings → Tutorials and picks "Understand invites".
2. They choose one of their upcoming classes (next four weeks).
3. They choose which enrolled player to imagine cancelling.
4. The app shows what would happen right now: anything that would stop the engine from contacting
   anyone at this moment (engine switched off, quiet hours, the class is too close, the invitation
   window has not opened yet), whether the coach would first be asked to approve, whether a
   waiting-list member would be placed directly instead, what the vacated spot looks like (side and
   level), and then every round in order with the students it would contact, their ranking values
   and a "first batch / waiting / over today's limit" badge.
5. Below the list, the coach types the name of any student who is missing from it and reads the one
   reason: they are the missing player, already in the class, below the eligibility bar (with the
   specific rule), excluded by the coach, an inactive account, marked unavailable at that hour,
   switched automatic invitations off, or matched none of the rounds.
6. They change the class or the player and the answer updates; nothing they do here has any effect
   on real invitations.

## Business Rules

1. The rehearsal must show **the same answer the engine would give**: the students listed, their
   order and their round are produced by the very code that fills real spots, never by a copy of it.
2. The rehearsal **never changes anything**: no invitation, no message, no approval request, no
   waiting-list placement, no credit spent, no spot opened.
3. It answers **as of right now**: the time-of-day and per-day limits are reported against the
   current moment, and the screen says when it was evaluated.
4. The "why not" answer names **one reason** — the first thing that stopped that student — and,
   where the reason is the eligibility bar, names the failed rule exactly as the manual-add warning
   does.
5. Only coaches see Tutorials; a student's Settings screen is unchanged.
6. Web and iOS ship the tutorial together.

## Success Metrics

- Fewer "why wasn't X invited?" questions reaching support and coaches' Discord.
- Not yet instrumented: number of rehearsals run per coach per month.

## Out of Scope

- Rehearsing a moment other than now ("what if she cancels tomorrow at 23:00").
- Listing every student who would *not* be invited (rosters run to hundreds; the single-student
  lookup covers the need).
- Running the rehearsal from the class detail page, or on a real open vacancy.
- Any other tutorial — this outcome establishes the Tutorials area with exactly one entry.

## Notes

- Decided 2026-09-06 in a brainstorm with the owner; see
  `.cortex/atlas/decisions/2026-09-06-invite-simulation-shares-the-engine-pipeline.md` for why the
  rehearsal shares the engine's code rather than describing it.
