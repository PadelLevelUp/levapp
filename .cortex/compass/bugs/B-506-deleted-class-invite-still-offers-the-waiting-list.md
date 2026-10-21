---
id: B-506
title: "An invitation bubble whose class was deleted offers 'Join the waiting list' again; the tap 404s and shows only the generic failure"
type: missing-criterion
severity: low
status: open
affects:
  - .specflow/specs/notifications/invitations.spec.md
  - frontend/packages/hooks/src/useInviteWaitingList.ts
  - backend/padel_app/services/academy_class_service.py
proposed_fix: "Server: a join for an instance that no longer exists answers a refusal code (e.g. class_closed) instead of a bare 404, so the student reads why. Client: a lost-to-another invitation whose occurrence is gone offers no join. Criterion in notifications.invitations rule 15a."
opened: 2026-10-11T18:00:00Z
---

# B-506: a deleted class's invitation still offers the waiting list

> Ledger id **unconfirmed** (wave-14 range). On this branch the index line sits after B-464.
> For next wave; it does not block promotion 10 (orchestrator, 2026-10-11).

**Source:** promotion-10 iOS gate at 3a43ec366, flow 269 run 2 (17:59–18:02 local), as the student.

**What happens:** run 1 left a lost-spot invitation (rule 15a) in the student's chat. The student
had joined that class's waiting list, so the bubble showed "Spot filled" plus the on-list state. Run
1's cleanup then deleted the class. On the next visit, that old bubble showed **"Join the waiting
list" again**, because nothing active matches its `lessonInstanceId` any more. Tapping it sent
`POST /api/app/class-waiting-list {model: LessonInstance, originalId: 16}` for an instance that no
longer exists. Flask answered **404**, the app showed the generic toast "Could not join the waiting
list." (`messages.joinWaitingListFailed`) and hid the button (`setRefused`). A real student gets
the same if a coach deletes a class after its spot was lost: an offer that cannot work, then a
reason-less failure.

**What should happen:** an invitation whose occurrence is gone offers no join. If a join still
reaches the server, it answers a refusal code with its own line (the `calendar.joinRequest.refusal.*`
family), not a bare 404.

**Evidence:**
- Failure screenshot of run 2: run 1's bubble shows only "Spot filled" (after the refused tap); run
  2's own bubble still shows "Join the waiting list".
- Flask log: `POST /api/app/class-waiting-list` 404 at 18:00:45.
- The hook's join → catch → `notify(joinRefusalMessageKey(e))` + `setRefused(true)`
  (`useInviteWaitingList.ts`). A 404 carries no `code`, so the generic key is used.
- API-only replay of two runs (`scratchpad/repro269.py`): each run's own bubble joins with 201
  (instances 16 and 17). Only the old bubble's instance 404s, which isolates the cause to the
  deleted class.
- Not verified: the toast's on-screen moment. It had already gone by the time of the screenshot
  ~17 s later; the code path is the evidence.

**Root cause:** rule 15a states when the offer appears (the invitation was lost to another student,
the class is ahead, the student is not on the list), but has no criterion for an occurrence that
was deleted afterwards, and the join endpoint maps "no such instance" to a bare 404. Type: missing
criterion.

### Change plan (next wave)
- `notifications.invitations` rule 15a: add "the occurrence was deleted → no offer; a stale join is
  refused as `class_closed`", with a criterion.
- Backend: `join_class_waiting_list_service` answers a refusal code when the instance is gone.
- Hook: a refusal hides the offer as now, but with the refusal's own line.
- Tests: service test (deleted instance → refusal code); hook test (stale offer → the specific copy).
