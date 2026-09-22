---
id: B-138
title: "A moved or deleted occurrence of a weekly class-request hold left a clone that no release path could find"
type: incomplete-rule
severity: medium
status: resolved
affects:
  - classes.class-requests
  - calendar.blocks
  - backend/padel_app/services/calendar_service.py
  - backend/padel_app/serializers/calendar.py
  - backend/padel_app/serializers/calendar_event.py
  - frontend/apps/web/src/pages/CalendarPage.tsx
  - frontend/apps/web/src/components/calendar/EventDetailSheet.tsx
  - frontend/apps/mobile/app/event/[id].tsx
proposed_fix: "Refuse a single/future move or delete on a live hold (409 HOLD_OCCURRENCE_LOCKED); serialize requestHoldOf on block detail and feed items so both shells stop offering the scopes; narrow rule 3."
opened: 2026-09-21T18:47:00Z
resolved: 2026-09-22T12:40:00Z
---

# B-138 — a moved occurrence of a hold is a clone nothing releases

**Source:** Session-B's cross-review of PR #345 (finding F2), confirmed by Session-C at the
service level (2026-09-21 18:38 UTC), reproduced by Session-D at the HTTP routes (2026-09-22
07:50 UTC, `feature/pad-372` @ dfb802152). Ticket PAD-372; id from Session-C's range, the
file rides with the fix.

**What happened:** a weekly request places one recurring hold on the coach's calendar
(`class_request_service._place_hold`). Moving one occurrence of it
(`POST /api/app/reschedule_block/<hold>`, scope `single` or `future`) or deleting one
(`DELETE /api/app/calendar_block/<hold>` with `{occDate, scope}`) went through
`calendar_service._clone_block` / `_split_block`: every extra row copied the hold's title and
no request pointed at it. Every release path (withdraw, decline, accept, editor delete, account
deletion — rule 18) deletes only `hold_block_id`, so the clones outlived the request under the
student's name, kept blocking the coach's free time (rule 1) and, being hold-titled but
unreferenced, made any title-based cleanup unsafe. With PAD-371's split a middle move left the
truncated hold, a one-off AND a resumed series — two clones instead of one.

**What should happen:** on accept the class is built from the REQUEST's recurrence
(`_create_class_and_accept` → `add_class_service` with `row.recurrence`) and a proposal moves
the SERIES (rule 16); the hold blocks are never read. So a per-occurrence change to a live hold
alters nothing the product honours. It is refused — `409 HOLD_OCCURRENCE_LOCKED` — and the
shells do not offer it; a change to the slot is proposed on the request. Whole-block delete and
retitle stay as rules 3 and 18 say. Decided by the coordinator on 2026-09-21 (D55, "(B)
refusal"); lineage (a `hold_of_request_id` on the block, released together) was rejected: a
migration and a backfill to preserve a gesture with no effect, colliding with PAD-378's "a
retitled block is the coach's".

**Root cause (where the wrong value first appears):** `calendar_service` knew nothing about
holds. Rule 3 said only "a plain block the coach may see and even delete" — the rule was
incomplete about what a per-occurrence change to a hold should mean, and the code took the
only meaning it had (an ordinary block).

**Affected specs:**
- Dev: `.specflow/specs/classes/class-requests.spec.md` (rule 3 narrowed, rule 18's known-gap
  bullet closed, new criterion "A live hold cannot be changed one occurrence at a time");
  `.specflow/specs/calendar/blocks.spec.md` rule 8 (cross-reference)
- Business: `.specflow/specs-business/classes/student-books-a-class.business.md` — unchanged
  (the outcome "the slot is held while the coach decides" is what the refusal protects)

### Change Plan

**Spec to modify:** `classes.class-requests` — Change type: narrow rule 3 + criterion.
**Then:** route tests written red by design (dfb802152) → refusal in
`reschedule_block_service` / `remove_block_service` → `requestHoldOf` on block detail and feed
items → both shells stop offering the scopes and map the 409 → Session-C's F2 pin rewritten as
the refusal → the `_busy_by_day` clone question answered by running.

### Resolution

- Spec changes: `classes/class-requests.spec.md` (rule 3, rule 18, new criterion),
  `calendar/blocks.spec.md` (rule 8).
- Tests: `test_pad372_hold_occurrence_change_is_refused.py` (4 refusals, 3 controls);
  `test_pad372_existing_clone_is_busy_for_its_own_student.py` (the open question, answered:
  an existing clone IS busy time for its own student — rule 1 excludes only `hold_block_id`);
  `test_pad360_request_hold_release.py::test_F2_…` rewritten from a known-gap pin to the
  refusal; serializer pins for `requestHoldOf` (live hold → request id; retitled, closed,
  ordinary → null).
- Code: `calendar_service._refuse_if_live_hold`; `models/class_request.live_hold_request_id`
  and `live_hold_index` (one query per feed); `serialize_calendar_block` and the CalendarBlock
  branch of `serialize_calendar_event` carry `requestHoldOf`; web `CalendarEventCard` not
  draggable on a hold, `CalendarPage` and `EventDetailSheet` skip the scope dialog and map the
  409; iOS `app/event/[id].tsx` the same; locale keys `calendar.page.holdOccurrenceLocked`,
  `calendar.eventDetail.holdOccurrenceLocked` (en, pt).
- Not changed: the clones already on production (a fixed population, PAD-360's v2 count reports
  them; the cleanup decision is the owner's); a ONE-OFF hold's drag is the whole-block move rule
  18 already allows (`PUT` new time) and stays allowed.
- Resolved: 2026-09-22 (PAD-372).
