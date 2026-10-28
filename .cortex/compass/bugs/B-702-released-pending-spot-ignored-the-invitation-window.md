---
id: B-702
title: "A spot released from awaiting approval invited at once, before the coach's invitation window"
type: incomplete-rule
severity: high
status: resolved
affects:
  - notifications.semi-auto-approval
  - notifications.invitations
  - backend/padel_app/services/notification_service.py
proposed_fix: "Semi-auto-approval rule 1a: the release (switch and sweep) stamps invite_not_before from the coach's current invitation start; invitations rule 11a: the sweep stamps a missing window on any open not_required spot. A window already past is not stored and the spot goes on."
opened: 2026-10-28T18:00:00Z
resolved: 2026-10-28T18:30:00Z
---

# B-702: a released pending spot ignored the invitation window

**Source:** prod rows read by SessionH, 2026-10-28 17:28Z (ids only), for the coach behind PAD-776.
Two spots of that coach's Friday classes, opened while the coach was semi-automatic and left
awaiting approval since 13 and 22 Oct, were released by the PAD-766 sweep at 10:08Z on 28 Oct and
invited at once; both were accepted within the hour. Under the coach's saved "2 days before at
19:00" their windows were 28 Oct 19:00 and 4 Nov 19:00.

**What happens:** a `pending` spot carries no `invite_not_before`: semi-automatic writes one only on
an approval "at the window". `_release_pending_approval` (used by `release_pending_approvals` on the
switch and by the sweep for stranded spots) set `approval_status = 'not_required'` and staled the
prompt, but computed no window. The sweep holds a spot only on `invite_not_before`, so it started
the released spot on the same tick, whatever the coach's invitation start.

**What should happen:** rule 1a says a released spot "invites like any automatic spot", and an
automatic spot opened before its window stores it and waits (invitations rule 11).

**Root cause:** rule 1a (PAD-766, B-688) said when the spot is released but not what window it
takes (incomplete rule). Not the B-694 shape: rule 11a's re-timing leaves pending spots alone, and
this coach's timing save came before the PAD-766 release anyway.

**Fix:** rule 1a gains the window sentence. The release stamps
`_compute_invite_start_dt(instance, coach timing)` when it is still ahead and leaves NULL when it
is past. A save that switches and moves the timing ends with the saved window (rule 11a re-times in
the same commit). Tests: `test_pad776_released_spot_takes_window.py`. The switch and sweep cases are
red on staging c27b9d1fe (`invite_not_before` None); the past-window and one-save cases are guards.

**Existing rows (coordinator, from SessionH's prod count 17:35Z: 79 open future spots
`not_required` with no window across two coaches):** the release stamp alone would leave them
sending. Invitations rule 11a gains a tick sentence: the sweep gives an open `not_required` spot
with no window the one the coach's current timing gives, holds it when still ahead, stores nothing
when past; 'Yes, right now' spots are exempt and stored windows stay the save's job. No migration,
no coach action. Only spots whose current window is still ahead pause; their live invitations
stay answerable. Test: `test_the_tick_stamps_a_missing_window_still_ahead_and_holds_the_spot`, red
with the tick block removed. The two spots in the report are filled.
