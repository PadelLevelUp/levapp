# eligibility — Who May Join a Class

## What this is

Eligibility is the minimum bar a student must meet to join a class at all — a floor, not an
ordering. The invitation engine's rounds (`notifications` domain) decide who gets asked first among
students already above that floor.

## What it covers

- `eligibility.coach-sets-the-eligibility-bar` — coach defines a standard bar (level, attendance
  history) and overrides it per recurring series or per single class
- `eligibility.coach-enforces-the-eligibility-bar` — the bar hard-gates automatic invitations and
  waiting-list placement, and warns (never blocks) a coach acting by hand
- `eligibility.student-discovers-open-spots` — an eligible student can see advertised open spots
  right on their own calendar

## Why it's grouped this way

Three distinct journeys with three different dominant personas: the coach configuring the bar, the
coach living with its automatic and manual consequences, and the student discovering a spot on
their own. They share one underlying concept (the bar) but are triggered at different times by
different people, so each is its own outcome rather than one combined spec.
