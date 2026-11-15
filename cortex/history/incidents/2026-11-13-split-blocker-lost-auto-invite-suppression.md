---
about: "Deleting or moving one occurrence of a student's recurring unavailability block made a continuation row that no longer held back invitations"
permanence: stable
verified: "2026-11-13 (observed)"
origin:
  - session:75d11801-afcd-44c9-b036-268537caa590
need:
  - backend/padel_app/services/calendar_service.py
aliases:
  - B-727
  - B-727-split-blocker-lost-auto-invite-suppression
---

# B-727: splitting a recurring blocker dropped its invitation suppression

**Source:** found in the review of the PAD-839 spec (profile stream, 2026-11-13, review item S8).
It shipped on its own fix branch, `fix/clone-block-keeps-auto-invite-suppression`, not with PAD-839.

**What happened:** a calendar block's series is split when one occurrence is deleted
(`remove_block_service` with `scope: "single"` → `_split_block`) or moved (`reschedule_block_service`).
The split shortens the original row and writes the rest of the series as a new row through
`_clone_block`. `_clone_block` copied every column except `blocks_auto_invitations`, which defaults to
false. Every student unavailability block has that flag set (`calendar.student-blockers`), so the
continuation row stopped counting as a blocker:
- `blocked_user_ids_for_window` filters on the flag. It is the predicate of the live engine's
  eligibility, manual send, reminders and delivery backstop, and of the new engine's store
  (`engine_store.TableStore._own_blocks`). So every later week reached the student again.
- The student's own list (`list_student_blockers`) filters on the flag too, so the later weeks also
  vanished from the Disponibilidade tab.
- Booking (`availability_service`) stopped taking those hours out.

**Reach:** the Disponibilidade tab always deletes a blocker whole (`scope: "all"`), so it never split
one. The split was reachable from the calendar. The player's calendar feed shows the student's own
blocks (`build_player_calendar_events`), and the generic `/calendar_block/<id>` delete and
`/reschedule_block/<id>` routes act on any user's own block with a scope. Whether the student's
calendar UI offers those actions on a block was not checked. The API path was.

**What should happen:** the rest of a split series is the same kind of block as before the split.

**Root cause:** a hand-written field copy (`_clone_block`) that predates the flag (PAD-28 added
`blocks_auto_invitations` to the reused model and set it after create, in the student service).
The copy was never extended.

**Fix:** `_clone_block` copies `blocks_auto_invitations`. Pinned by CALENDAR-STUDENT-BLOCKERS-14.

Filing: splitting a recurring blocker dropped its invitation suppression → cortex/history/incidents/2026-11-13-split-blocker-lost-auto-invite-suppression.md (origin: session:75d11801-afcd-44c9-b036-268537caa590)
