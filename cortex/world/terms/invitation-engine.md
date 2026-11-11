---
about: "The vacancy-filling invitation system end to end: when a seat opens (a decline, a no-show, a manual vacancy), the engine ranks eligible candidates, invites…"
permanence: changing
verified: "2026-09-03 (inferred)"
origin:
  - migrated:insight/concepts/invitation-engine.md@ef7a5f3
---

The vacancy-filling invitation system end to end: when a seat opens (a decline, a no-show, a manual vacancy), the engine ranks eligible candidates, invites them in gated waves through one delivery chokepoint, retires competing offers the moment a seat fills, and sweeps stale/inactive vacancies on a periodic scheduler tick. It spans the full stack — persistent config and state in the models, the ranking/delivery/sweep logic in the services, thin route plumbing in the API layer, a client SDK, and settings UI on both web and (via the shared coach-only settings gate) mobile. This concept is deliberately broad: it unifies what earlier extraction passes proposed separately as "invitation-and-vacancy-engine-config", "invitation-engine", "invitation-vacancy-engine", "notification-engine-client", "notification-engine-settings" and "auto-invite-engine-config" — all facets of the same one system. [[eligibility-bar]] (who may join at all) and [[semi-automatic-approval]] (the coach-in-the-loop variant of a fill) are deliberately kept as separate, related concepts rather than folded in here, because they are distinct mechanisms layered on top of this engine rather than the engine itself.

## Implemented by
`backend/padel_app/models/notification_config.py`
`backend/padel_app/models/vacancy.py`
`backend/padel_app/models/notification_event.py`
`backend/padel_app/models/replacement_approval_prompt.py`
`backend/padel_app/models/waiting_list_entry.py`
`backend/padel_app/models/standing_waiting_list_entry.py`
`backend/padel_app/services/notification_service.py`
`backend/padel_app/services/replacement_approval_service.py`
`backend/padel_app/scheduler.py`
`backend/padel_app/modules/notification_engine_api.py`
`frontend/packages/api/src/resources/notificationEngine.ts`
`frontend/packages/hooks/src/useAutoInviteEnabled.ts`
`frontend/apps/web/src/components/settings/NotificationsEngineSection.tsx`
`frontend/apps/web/src/components/settings/StandingWaitingListSection.tsx`
`frontend/apps/web/src/components/calendar/ManualNotificationModal.tsx`
`frontend/apps/web/e2e/notification-engine/reminder-flow.spec.ts`
`frontend/apps/web/e2e/notification-engine/manual-notify-selection.spec.ts`
`frontend/apps/web/e2e/notification-engine/standing-waitlist-expired.spec.ts`
`frontend/apps/web/e2e/settings/ticket-pad-109-standing-waitlist-search.spec.ts`
`frontend/apps/web/e2e/schedule-calendar/guest-list-dedupe.spec.ts`

## Related concepts
[[eligibility-bar]]
[[semi-automatic-approval]]
[[reminder-lifecycle]]
[[level-ladder-adjacency]]
[[coach-only-settings-gating]]

(Merged text above: `.cortex/insight/concepts/invitation-engine.md`.)

## Detail from `.cortex/insight/scopes/backend-services/concepts/invitation-engine.md`

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
