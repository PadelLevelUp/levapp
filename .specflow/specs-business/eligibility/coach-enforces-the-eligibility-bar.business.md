---
id: eligibility.coach-enforces-the-eligibility-bar
status: draft
implemented_by:
  - ../../specs/eligibility/enforcement.spec.md
---

# Coach enforces the eligibility bar

## Outcome

Once a coach has set an eligibility bar, it becomes a hard wall for everything the system does on
its own — the automatic invitation engine and the standing waiting list simply stop considering
students who don't clear it. But the coach's own judgment is never overridden: adding a student to
a class by hand still works, with a plain-language warning naming exactly why that student falls
short, so the coach can decide anyway. Tightening the bar never removes anyone already enrolled —
it only ever governs joining, never staying.

## Who This Is For

A coach whose eligibility bar needs to actually mean something in the automatic engine, while
keeping full control to make an exception themselves.

## User Journey

1. With a bar set, the coach's automatic invitation rounds still widen exactly as before — but the
   widest round now means "everyone eligible", not literally everyone.
2. A student on the standing waiting list who no longer clears the bar for a class is quietly
   skipped when a spot opens there — no credit is spent, and the spot goes to normal invitations
   instead.
3. The coach adds a student to a class by hand who doesn't meet the bar — a two-level gap, say.
   Before the add goes through, they see a plain warning naming exactly what failed ("2 levels
   below this class"), and they can confirm anyway or cancel.
4. The coach tightens their bar — say, lowering the absence limit. Saving it doesn't touch a single
   already-enrolled student, but the coach sees an informational note naming who among their
   currently-enrolled students would no longer clear the new bar, so they know without having to
   check manually.

## Business Rules

- Automatic invitation rounds and waiting-list placement are hard-gated by the bar; a coach acting
  by hand is only warned, never blocked — enrolment is always the coach's call.
- The warning names every rule a student fails, in concrete terms ("2 levels below this class",
  "4 unjustified absences, limit is 2") — never a bare "not eligible" with no explanation.
- The same check that decides pass/fail is the one that generates the warning text — they can never
  disagree, so a coach is never warned about a student who then gets silently enrolled, or the
  reverse.
- A student is never placed back into the exact spot their own cancellation just created, and never
  placed into a class they're already in.
- Waiting-list placement, manual invitations and the automatic engine all honor the same exclusion
  and restriction settings (excluded players, inactive-account exclusion, calendar
  availability blockers) regardless of whether a bar is even defined.
- Tightening a bar is informational only — it reports who would now fail it among enrolled
  students, but removes nobody and notifies nobody. Membership, once granted, isn't retroactively
  revoked by a stricter rule.
- With no bar defined, automatic placement stays exactly as unfiltered as it's always been — that's
  the coach's choice by omission, not a decision the engine makes for them.

## Success Metrics

Not yet measured.

## Out of Scope

- Defining the bar itself, and its per-series/per-class overrides — see "Coach sets the eligibility
  bar".
- Students discovering open spots on their calendar — see "Student discovers open spots".
- The invitation engine's own round-by-round matching order — a separate, pre-existing mechanism
  this bar caps but doesn't replace.

## Notes
- None.
