---
id: B-618
title: "PAD-732: a manual invitation on a class with notifications off returned 200 and sent nothing"
type: incomplete-rule
severity: high
status: resolved
resolved: 2026-10-22T11:00:00Z
affects:
  - backend/padel_app/services/notification_service.py
  - .specflow/specs/notifications/toggle-class.spec.md
proposed_fix: "send_manual_notifications no longer returns [] when the occurrence's notifications_enabled is off; the switch governs only the engine's automatic sends (toggle-class rule 3b)."
opened: 2026-10-22T07:45:00Z
---

# B-618: a manual invitation was silently dropped on a notifications-off class (PAD-732)

**Source:** session C, reading the red E2E subset of the PAD-672 chain (2026-10-22). Once B-617
(PAD-729) made a class created with notifications off keep them off, the E2E pad664 fixture's
manual invitation stopped arriving.

**What happened:** `send_manual_notifications` returned `[]` at its first line when the occurrence's
`notifications_enabled` was off. `POST /api/app/notify/manual` answered 200 with `sent: 0`, so the
coach believed the student was invited and nothing was sent. Toggle-class rule 3 named reminders
and auto-invitations only; it was silent on manual invitations.

**Decision (owner, 2026-10-22):** a manual invitation always goes out; "notifications off" governs
only the engine's automatic sends (the PAD-429 principle, applied to `notifications_enabled`).

**Evidence:** `test_pad732_manual_invite_on_a_notifications_off_class.py`. The manual case is red
with the old guard (0 events) and green without it: one `manual` event, `sent`, with its message.
Control: `trigger_invitations` on the same off class still sends nothing.

**Not covered here:** reminders on an off class still go out (`send_class_reminders` does not read
the switch; toggle-class Notes, OPEN). That is its own ticket, for the owner.
