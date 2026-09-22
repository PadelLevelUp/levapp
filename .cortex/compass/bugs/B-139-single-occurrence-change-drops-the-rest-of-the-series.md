---
id: B-139
title: "Deleting or moving ONE occurrence of a recurring calendar block dropped every later occurrence (and did nothing at all to the first)"
type: test-defect
severity: high
status: resolved
affects:
  - calendar.blocks
  - backend/padel_app/services/calendar_service.py
  - frontend/apps/web/src/components/calendar/EventDetailSheet.tsx
proposed_fix: "_split_block asks where the series resumes BEFORE shortening recurrence_end; _next_occurrence_after excludes the whole of the occurrence's date."
opened: 2026-09-21T18:38:00Z
resolved: 2026-09-21T19:25:00Z
---

# B-139 — one occurrence changed, the rest of the series lost

**Source:** Session-C, 2026-09-21, from a service-level probe while working on class-request holds
(number assigned by C; ticket PAD-371, given to Session D by the coordinator with the instruction
to reproduce at the route and in the UI before believing it).

**What happened (reproduced by Session D at the HTTP routes on Postgres, 18:50 UTC, staging 00e53375f;**
a weekly Thursday block 2026-10-01 → 2026-10-29):
- `DELETE /api/app/calendar_block/<id> {occDate: 2026-10-15, scope: single}` → 204; the calendar
  then served Oct 1 and 8 only. One row, `recurrence_end` 2026-10-14, no resumed series.
- `POST /api/app/reschedule_block/<id>` moving Oct 15 to 15:00, scope single → the one-off at 15:00
  was made and Oct 22 and 29 were gone.
- **Found in the branch C listed as unchecked:** deleting the FIRST occurrence (Oct 1) answered 204
  and removed nothing; moving it left the original beside the moved copy.
- The LAST occurrence and both `future` scopes behaved as designed.

**Where the wrong value first appears:** `_split_block` set `recurrence_end = occ_date - 1 day`,
saved, and only THEN called `_next_occurrence_after`, whose search is bounded by
`block.recurrence_end` — the end it had just shortened. It found nothing, so the "resume from the
next occurrence" clone was never created. Separately, `_next_occurrence_after` called itself
exclusive but searched from MIDNIGHT of `after_date`, so the occurrence later that same day was
"next": the first-occurrence branch advanced the start to where it already was. The two interact —
moving the search before the shortening, alone, would resume the series ON the deleted date and
turn "drops everything" into "deletes nothing".

**Classification:** `calendar.blocks` already said "only the April 17 occurrence moves" and no test
encoded it (the only tests on these routes were authz and the bodyless delete) → a criterion with
no test. Delete-with-scope had no rule at all, and rule 5 named a route that does not exist; both
are written now (rules 5, 8, 9).

**Reach:** delete-single is offered on web and iOS; move-single on web only (drag-and-drop; iOS has
no block reschedule); edit takes no scope. Student availability blockers share
`remove_block_service` but the app always sends scope `all`, so they were not exposed.
**Production:** not measured here. A row keeps no record of its original end, so a count can only
find candidates (a recurring block whose `recurrence_end` is the day before one of its own
weekdays), and per Session-C `is_recurring` is unreliable on blocks — test the flag AND the rule.
A read-only count is in Session-A's queue.

**Affected specs:**
- Dev: `.specflow/specs/calendar/blocks.spec.md`
- Business: `.specflow/specs-business/calendar/coach-blocks-personal-time.business.md` (no drift)

### Change Plan

Type 7 for the move (criterion, no test) + rule gap for the delete. Write the route-level tests
first (they fail), then fix the two helpers; web and iOS UI tests, since both shells offer the scope.

### Resolution

- Spec changes: `calendar.blocks` rule 5 corrected, rule 6 worded, rules 8 and 9 and the criterion
  "Deleting one occurrence keeps the rest" added.
- Tests added: `test_pad371_single_occurrence_keeps_series.py` (11, route level): 7 failed / 4
  passed on the old code — the 4 being the fixture, the LAST occurrence and both `future` scopes —
  and 11/11 on the fix, 14/14 on Postgres with the PAD-160 file; 307 passed across the 22
  neighbouring test files. Web `pad371-event-single-occurrence.spec.ts`: on the old service it fails
  with exactly 2026-10-05 and 2026-10-12 missing, on the fix it passes. Maestro flow 93: fails on the
  old service at its final assertion, passes on the fix.
- Code changes: the two helpers in `calendar_service.py`; `data-testid="event-detail-delete"` on
  web's event sheet (iOS already had it).
- Known consequence, NOT fixed here: a `single` change to a class-request hold now leaves TWO
  unlinked blocks (the one-off and the resumed series) where it left one — PAD-372 (B-138),
  Session-C's. Session-C's pin `test_F2_KNOWN_GAP_…` (PAD-360, #345) asserts today's counts and is
  flipped by this PR's author once #345 is on staging.
- Resolved: 2026-09-21 (PAD-371).
