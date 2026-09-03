---
concept: invitation-engine
---

# Invitation engine (waves/rounds)

**Definition.** The vacancy-filling machinery: when a spot opens (a
student declines, or a class was never fully enrolled), the engine
ranks eligible candidates (see [[eligibility-bar]]) by either
invitation-GROUP rules (`config.get_invitation_groups()`, newer) or
legacy round CRITERIA (`config.get_rounds()`), and invites them in
batches ("waves") — a batch size gated by `maxSimultaneous`/`maxTotal`
restrictions, sent through the one delivery chokepoint
`_send_system_message`. A "yes" fills the spot and retires every other
pending offer for it (`_broadcast_spot_filled`); a "no" or timeout
advances to the next candidate/round. Two parallel timing triggers
drive it: an immediate call after a decline (once the invitation window
is open) and a recurring 2-minute sweep
(`process_invitation_batches`) that catches vacancies nobody answered
in time. In "semi-automatic" mode, a vacancy needs coach approval
(`replacement_approval_service.py`) before any invitation is sent.

**Implementing files:**
- `backend/padel_app/services/notification_service.py` —
  `_send_invitation_batch` (the single per-vacancy sending chokepoint),
  `trigger_invitations` (main entry point), `process_invitation_batches`
  (the recurring sweep), `_advance_round`/`_send_next_on_decline`,
  `respond_to_notification`/`coach_respond_to_notification` (yes/no
  handlers), `_check_waiting_list`/`_fill_from_waiting_list` (placement
  competes with a fresh invite round).
- `backend/padel_app/services/replacement_approval_service.py` — the
  semi-automatic gate in front of the engine: creates
  `ReplacementApprovalPrompt`s and snapshots the full invite queue
  (`compute_full_invite_queue`) before any send.
- `backend/padel_app/scheduler.py` — arms the `invite_start_{instance_id}`
  DateTrigger job and the recurring `process_batches` IntervalTrigger
  that drives `process_invitation_batches`.

**Related concepts:** [[eligibility-bar]] (gates candidates before
waves rank them), [[lazy-instance-materialisation]] (a vacancy only
exists on a materialized `LessonInstance`; the standing waiting list
fans into every NEWLY materialized instance via
`_sync_standing_entries_for_new_instance`).
