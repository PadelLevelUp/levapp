---
id: B-688
title: "A coach who switched from semi-automatic to automatic kept the spots opened under semi-automatic awaiting approval for good: the sweep never invited them"
type: incomplete-rule
severity: high
status: resolved
affects:
  - notifications.semi-auto-approval
  - backend/padel_app/services/notification_service.py
proposed_fix: "Semi-auto-approval rule 1a: the switch to automatic releases the coach's open pending spots (not_required, prompt stale) in the mode's commit; the sweep releases a pending spot whose coach is now automatic, so stranded rows recover; dismissed spots stay dismissed."
opened: 2026-10-27T20:00:00Z
resolved: 2026-10-27T21:00:00Z
---

# B-688: mode switch stranded spots awaiting approval

**Source:** the owner's iOS screenshots of one class's attendance sheet, 2026-10-27 16:46Z; prod
rows read by SessionH (read-only, head 9c62d538). Linear PAD-766.

**What happens:** a vacancy takes `approval_status` from the coach's mode when it is created
(`pending` under semi-automatic, `not_required` under automatic) and nothing looks at it again.
`update_config` changed the mode and touched no vacancy; `process_invitation_batches` skips every
`pending` vacancy whatever the coach's mode is now; `trigger_invitations` and PAD-679's sibling
moves only feed spots that can send. On prod, two spots freed on 14 and 21 Oct under
semi-automatic stayed pending after the coach went automatic (between 21 and 26 Oct); a spot freed
on 26 Oct was invited automatically and filled, its other invitees expired "spot filled", and the
21 Oct spot still had no invitation six days later. The coach: "the system closed the spot on
opening and stopped".

**What should happen:** leaving semi-automatic hands the spots still awaiting approval to the
automatic engine; a spot the coach dismissed stays dismissed.

**Root cause:** `notifications.semi-auto-approval` rule 1 said which mode a vacancy is created in
and stated nothing for a mode change with spots already pending (incomplete rule). Not caused by
PAD-733 (#855): every decline on the class predates its deploy.

**Fix:** rule 1a; `release_pending_approvals` in `update_config` (same commit as the mode) and the
sweep's release of a pending spot of an automatic coach. Prompts are marked `stale` (the enum has
no `superseded`; the coordinator accepted `stale`).
Test: `backend/padel_app/tests/test_pad766_mode_switch_releases_pending_spots.py`.
