---
id: B-113
title: "The iOS class screen requested the calendar with an empty range before the class loaded"
type: missing-criterion
severity: low
status: resolved
affects:
  - frontend/packages/hooks/src/queries.ts
  - frontend/apps/mobile/app/class/[id].tsx
proposed_fix: "useCalendarEvents is disabled while from or to is empty."
opened: 2026-09-16T15:39:35Z
---

# B-113: an empty calendar range on every class open

**Source:** seen by Session J on 2026-09-15 while verifying #256 (PAD-326). Ticket PAD-348.
Bug number from Session E's reserved range (unconfirmed).

**What happened:** `app/class/[id].tsx` feeds `useCalendarEvents` the day of the draft or
instance for its PAD-159 overlap check, and `""` until the instance loads. The shared hook had
no `enabled` gate, so every class open sent `GET /api/app/calendar?from=&to=` and got a 400
before the real request. Nothing was visible to the user; each open left one 400 in the
server log, noise that hides real 400s.

**Why the spec did not catch it:** `calendar.view` defined the endpoint's range, never that a
client must not ask for an empty one.

**Fix (PAD-348):** `calendar.view` rule 17. The hook is disabled while either end is empty, so
every caller is covered, not only the class screen. Guarded by
`packages/hooks/src/useCalendarEvents.test.tsx`.

**Evidence for `resolved`, and when it was first obtained (B-127, PAD-383).** From 2026-09-16
until 2026-09-21 that test was collected by **no** runner (the packages vitest config listed
`*.test.ts` only), so this entry was marked resolved on the strength of a test that had never
been executed. First run on 2026-09-21 19:56 UTC at `origin/staging` `00e53375f`: 2 passed; with
the `enabled` guard removed from `queries.ts` the first test fails ("expected spy to not be
called at all, but actually been called 1 times"); restored, 2 passed. The status stands — on
evidence five days younger than the claim.
