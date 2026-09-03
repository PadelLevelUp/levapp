---
id: eligibility.coach-sets-the-eligibility-bar
status: draft
implemented_by:
  - ../../specs/eligibility/rules.spec.md
  - ../../specs/eligibility/cascade.spec.md
---

# Coach sets the eligibility bar

## Outcome

A coach defines the minimum bar a student must clear to join their classes at all — by level, by
attendance history, or both — separately from the invitation-round ordering that decides who gets
asked first. They can set one standard bar for their whole academy, then loosen or tighten it for a
particular recurring class, or for just one occurrence, without touching anything else.

## Who This Is For

A coach who wants a floor on who can join a class (e.g. "no more than one level below this group",
or "no student over the unjustified-absence limit"), distinct from the priority ordering the
invitation engine already applies.

## User Journey

1. The coach opens their standard eligibility settings and picks a level condition (e.g. "within
   one level of the class"), an absence condition (e.g. "at most 2 unjustified absences"), or
   both — or leaves it unset, in which case every student on their roster is eligible for
   everything, exactly as before this feature existed.
2. For a particular recurring class that needs a stricter or looser bar than their standard —
   an advanced group, say — they open that class's settings and override eligibility just for that
   series.
3. For one single occurrence that's an exception even to the series — a trial class open to
   everyone — they override eligibility for just that date, leaving the rest of the series
   untouched.
4. Wherever they look at the class, they can see which tier the active bar came from: their
   standard, the series, or this one occurrence.
5. From here on, the bar the coach set governs who the automatic invitation engine and waiting list
   will consider — see "Coach enforces the eligibility bar" — and, if the coach also enabled it,
   who can discover the class as an open spot on their own calendar — see "Student discovers open
   spots".

## Business Rules

- The bar is optional. Left unset, nothing changes — every student is eligible for every class,
  exactly as before this feature existed.
- The most specific bar wins outright — one occurrence's own setting beats its series, which beats
  the coach's standard. They never combine or stack; setting a bar for a class replaces the
  standard, it doesn't add to it.
- Explicitly clearing the bar for one class (setting it to "everyone", rather than leaving it
  unset) is the one way to open a single class inside an otherwise restricted series — and it's
  treated as a deliberate choice, distinct from simply not having set anything.
- A defined bar that nobody can actually satisfy — e.g. a level condition against a class that has
  no level assigned — excludes everybody from that class. That's different from an unset bar, which
  excludes nobody; the two must never be confused.
- v1 conditions are level (how close to the class's own level) and attendance history
  (unjustified/justified absences, attendance rate) only. Playing side and payment status are
  deliberately not eligibility conditions — side stays an invitation-ordering concern, and no
  payment state exists yet to check.
- Changing the bar for "this and future classes" splits the series from that point forward, the
  same way any other schedule edit does — classes before the change keep the old bar.
- Existing coaches start with no bar set at all — this feature never silently narrows who was
  already able to join a class.

## Success Metrics

Not yet measured.

## Out of Scope

- What actually happens because of the bar — automatic invitations being capped, waiting-list
  placements being filtered, or a coach being warned on a manual add — see "Coach enforces the
  eligibility bar".
- Students discovering open spots on their own calendar — see "Student discovers open spots".
- The invitation engine's round-by-round ordering (level match, side match, tiebreakers) — a
  separate, pre-existing mechanism in the `notifications` domain that the bar sits underneath, not
  on top of.

## Notes
- This domain is `draft` status end to end (PAD-128/129 in progress) — verify current
  implementation status against the leaf specs before treating any of this as shipped.
