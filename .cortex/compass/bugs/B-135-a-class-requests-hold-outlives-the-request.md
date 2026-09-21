---
id: B-135
title: "A class request's hold outlives the request: editor deletes and account deletion leave a ghost block on the coach's calendar"
type: incomplete-rule
severity: medium
status: triaged
affects:
  - classes.class-requests
  - auth.account-deletion
  - backend/padel_app/models/class_request.py
  - backend/padel_app/services/class_request_service.py
  - backend/padel_app/services/account_service.py
proposed_fix: "Rule 18: a hold never outlives its request. ORM hooks delete the hold when a ClassRequest row is deleted and before a Player/Coach delete cascades its requests away; account deletion closes open requests silently (student: withdrawn, coach: declined)."
opened: 2026-09-21T18:01:42Z
---

# B-135: a hold that outlives its request

**Source:** Session C, 2026-09-21, on a brief from the Coordinator. The claim came from a
previous session's memory note (2026-09-17, four days old) and named only the editor path. It
was reproduced before it was believed. Number from Session C's reserved range (B-135–139),
confirmed by the Coordinator.

**What happens:** `classes.class-requests` rule 3 holds a requested slot with a `personal`
CalendarBlock on the coach's calendar and deletes it "when the request leaves
`pending`/`countered`". Only the status transitions did that (`_close()` and
`_create_class_and_accept()`). Every path that removes the request, or the people behind it,
skipped the release.

**Evidence (origin/staging 00e53375f, 2026-09-21 17:55 UTC, sqlite with foreign keys on,
`test_pad360_request_hold_release.py` run through suite-runner — 3 passed, 5 failed, 1 observed):**

| Path | Observed |
|---|---|
| student `withdraw`, coach `decline`, coach `accept` (controls) | hold released |
| `DELETE /api/editor/classrequest/<id>` | request gone, hold stays |
| `POST /api/delete/classrequest/<id>` (legacy editor route) | request gone, hold stays |
| `DELETE /api/editor/player/<id>` | `ON DELETE CASCADE` removes the request in the database, hold stays |
| student deletes their account (`DELETE /api/auth/me`) | request stays `pending`; hold stays, titled with the deleted student's real name |
| coach deletes their account | the coach's blocks are purged, the request stays open for ever on the student's side |
| coach disconnects the student (observation) | request stays `pending` with its hold |

The account-deletion row is the one a real user reaches, and it is also a privacy residue:
`auth.account-deletion` rule 2 says the name is gone, and the block title keeps it.

**The observation that selected the type:** the controls pass and the failures are all paths no
rule mentions. Rule 3 speaks of status transitions only; neither spec says what happens to an
open request when its row, its student or its coach goes away. `git log` on the four files shows
no commit that ever released the hold on these paths (PAD-104 built the hold, PAD-268 the
deletion cascade, without class requests) — an incomplete rule, not a regression. The FK
`class_requests.hold_block_id → calendar_blocks` is `SET NULL` on the request side, so nothing
in the database removes the block either. The business spec (`student-books-a-class`) says the
same as the dev spec: no layer drift.

**What should happen:** a hold never outlives its request, however the request goes away.

**Affected specs:**
- Dev: `.specflow/specs/classes/class-requests.spec.md`, `.specflow/specs/auth/account-deletion.spec.md`
- Business: `.specflow/specs-business/classes/student-books-a-class.business.md` (unchanged)

### Change Plan

**Change type:** add rule + acceptance criteria (type 2).

- `classes.class-requests` rule 18 "A hold never outlives its request", three criteria; rule 3
  points at it.
- `auth.account-deletion` rule 6 gains a bullet (a deleting student's open requests close as
  `withdrawn`, silently, and they leave other people's invitee lists), rule 10 a sentence (a
  deleting coach's open requests close as `declined`, silently), one criterion.
- **Decisions (Session C, confirmed by the Coordinator 2026-09-21):** silent means no
  notification in either direction; a disconnect is left out and recorded on PAD-360 for the
  owner; backend-only, because web and iOS already render `withdrawn` and `declined`.
- Tests: `backend/padel_app/tests/test_pad360_request_hold_release.py`, a 2×2 — old/new code ×
  trigger present/absent (the three controls, a closed request deleted, a deletion with no
  requests, closed requests left alone).
- Code: `after_delete` on ClassRequest and `before_delete` on Player and Coach
  (`models/class_request.py`); `close_open_requests_silently` (`class_request_service.py`)
  called from `delete_account_service` before the coach's blocks are bulk-deleted.

### Resolution

_Open — filled in when PAD-360 lands._
