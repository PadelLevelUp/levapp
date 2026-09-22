---
id: B-151
title: "A hold the coach had retitled was deleted when the request closed"
type: incomplete-rule
severity: medium
status: resolved
affects:
  - classes.class-requests
  - backend/padel_app/services/class_request_service.py
  - backend/padel_app/models/class_request.py
proposed_fix: "Every release path deletes the block only while it is still recognisably a hold; otherwise it clears the pointer and keeps the block."
opened: 2026-09-21T19:13:00Z
resolved: 2026-09-22T20:45:00Z
---

# B-151 — a retitled hold was deleted when the request closed

**Source:** found by Session-C while reviewing PR #345 (PAD-360) on 2026-09-21. Pinned there as
`test_REFERENCE_an_open_requests_block_goes_when_it_closes_even_if_the_coach_retitled_it`.
Filed as PAD-378. The coordinator decided the same day that deleting an event a coach has made
their own is a defect, not a product choice: decision **D41** (run record, 2026-09-21 19:13 UTC,
"OPEN-request case (retitled live hold deleted on withdraw) is a defect, coordinator's decision,
not the owner's: own ticket B-151").

**What happens:**
1. A student requests 11:00–12:00; the coach's calendar gets a hold,
   `('personal', 'Pedido de aula · booker', 11:00)`.
2. The coach `PUT /api/app/calendar_block/<hold>` with title "Physio", 11:30–12:30 → 200.
3. The request stays open and still points at the block (`hold_block_id`).
4. When the request closes, `class_request_service._release_hold` deletes whatever block it
   points at, and the coach's "Physio" is gone. The hooks (`before_delete`, `before_update`
   closed-in-this-flush, the cascade listener) did the same for an open request.

**Reproduced (2026-09-22, origin/staging 84c125938):** the REFERENCE pin passed on staging, so
the block was deleted. The new test file run against staging's versions of the two changed
files: **8 failed** (every retitled cell: withdraw, decline, accept, editor-delete, editor-close,
player-cascade, counter-proposal, release_holds_of_players) and **7 passed** (every untouched
cell, plus the moved-only one).

**What should happen:** closing or removing the request clears the pointer and leaves a block
the coach has retitled. An untouched hold, or a hold that was only moved, is still released.

**Which observation selected the type:** rule 18 covered a CLOSED request's leftover pointer
("only while the block is still recognisably a hold") and said of an OPEN one that a retitled
hold's survival was "a product question". The rule was incomplete for the open case, and the
code took the only meaning it had: delete. The predicate needed already existed
(`_is_hold`, PAD-372).

### Change Plan (executed)
- `_release_hold` deletes the block only if `_still_a_hold(block)`; the pointer always goes.
  It returns whether it deleted.
- `_delete_blocks` always filters through `_is_hold`. The `only_if_still_a_hold` switch is
  gone, so the before_delete hook, the before_update hook and the cascade listener treat open
  and closed requests alike. `release_holds_of_players` goes through `_release_hold`.
- Rule 18 states the rule, including moved-only holds and counter-proposals. The REFERENCE
  pin is flipped to `test_an_open_requests_retitled_block_stays_when_it_closes`.

### Resolution
- Tests: `test_pad378_retitled_hold_is_the_coachs.py`, 15 cells (the 2×2 over six paths,
  moved-only, counter-proposal with free-blocks, release_holds_of_players). The class-request
  families pad104, pad281, pad360, pad372 and pad378 give 78 passed on SQLite.
- Backend only: web and iOS show and edit a hold as a plain block already.
