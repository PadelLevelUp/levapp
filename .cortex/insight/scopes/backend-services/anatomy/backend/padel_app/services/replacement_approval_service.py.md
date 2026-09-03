---
path: backend/padel_app/services/replacement_approval_service.py
extracted_at: 2026-09-03T13:58:46Z
extraction_level: 2
size_lines: 404
size_tokens: 3648
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "03dc1196cc37e5fb5b7e08cb88e294b55d51886d2f6d422ff99e5895793cac16"
---

## Purpose

Implements semi-automatic invitation mode
(`NotificationConfig.invitation_mode == "semi_automatic"`): instead of
the notification engine auto-sending replacement invitations for a
vacancy, it asks the coach for approval first. Each vacancy gets a
`ReplacementApprovalPrompt` (declined player + the full ordered invite
queue); prompts created together share a `bundle_id` and are delivered
as ONE message in a dedicated "LevelUp Assistant" system conversation
(`get_or_create_assistant_user`, a `status="disabled"` user so it never
appears in the active-users list). `compute_full_invite_queue` snapshots
the full ordered, deduplicated eligibility queue across all
rounds/groups. `respond_to_approval` applies the coach's decision
(`yes_now` | `yes_at_window` | `dismiss`) per-vacancy, updating the
persisted message metadata and, for approvals, calling
`notification_service.trigger_invitations` once per affected instance.

## Connections

- Uses: `padel_app.sql_db.db`; `padel_app.realtime.publish`;
  `padel_app.utils.dates.utcnow_naive`;
  `padel_app.utils.push_notifications.send_push_notification`; lazy
  imports of `padel_app.models` (`User`, `Coach`, `Message`,
  `Conversation`, `ConversationParticipant`, `Player`,
  `ReplacementApprovalPrompt`), `padel_app.scheduler._compute_invite_start_dt`,
  `padel_app.serializers.message.serialize_message`, and
  `services/notification_service.py`
  (`_get_eligible_students_for_group`, `_serialize_cp_for_group`,
  `get_eligible_students`, `_check_waiting_list`, `get_or_create_config`,
  `trigger_invitations`).
- Used by: `services/notification_service.py` calls into this module in
  the reverse direction when a vacancy opens under semi-automatic mode
  (not visible in this file — see `notification_service.py`'s L3 entry).

## Insights

- Idempotency: `create_approval_prompts` checks for an existing
  `ReplacementApprovalPrompt` per vacancy before creating a new one — a
  re-triggered vacancy computation (e.g. re-running `confirm_presences`)
  returns the SAME bundle rather than duplicating the coach's Assistant
  message.
- The whole prompt-creation path (prompts, conversation, assistant user,
  message) is built with `flush()` rather than `commit()` at each step
  and committed ONCE at the end — explicitly so a later failure never
  leaves orphaned prompts without their message, or a message without
  its prompts.
- `respond_to_approval`'s staleness check
  (`prompt.status != "pending" or vacancy is None or vacancy.status !=
  "open" or instance is None or instance.start_datetime <= _now`) means
  a coach can "approve" a bundle whose vacancy already filled or whose
  class already started — the result is silently `"stale"`, not an
  error, and the UI must read the per-vacancy `result` field rather than
  assuming success.
- `"yes_at_window"` executes immediately as `"yes_now"` when the
  invitation window has already opened by the time the coach responds —
  the semantic distinction only matters if the window is still in the
  future, in which case `vacancy.invite_not_before` is set instead of
  calling `trigger_invitations` right away.
