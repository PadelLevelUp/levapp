---
path: backend/padel_app/services/student_notification_preferences.py
extracted_at: 2026-09-03T13:58:46Z
extraction_level: 2
size_lines: 206
size_tokens: 2000
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "f2e8f1bc882a913aa1f9d5c8c4ff8fc827cb01f30fdcf0063da7efef18d26dd9"
---

## Purpose

PAD-112: the student's own standing "don't invite/notify me" preference
toggles, stored on `User` (`notif_block_auto_invitations`,
`notif_block_manual_invitations`, `notif_block_all`,
`notif_block_reason`). Three independent levels — auto (engine
invitations), manual (coach-picked invitations), all (every class-slot
solicitation, reminders included) — each answered "does this student
want to be asked at all", evaluated purely against the user row (no
time/instance context). Provides read helpers keyed by user id or
player id, a shared coach-facing payload builder
(`notification_block_payload`), and list-filtering helpers
(`filter_preference_blocked_coach_players`, `preference_blocked_players`).

## Connections

- Uses: `padel_app.models.User`, `padel_app.models.Player` (both
  imported lazily inside functions).
- Used by: `services/player_service.py`
  (`_serialize_coach_player_relation` merges in
  `notification_block_payload(user)`); enforcement is documented (per
  the module docstring) to live in `services/notification_service.py`
  at three separate choke points — `get_eligible_students`/
  `_get_eligible_students_for_group` (auto), `send_manual_notifications`
  (manual, before the `NotificationEvent` is created), and
  `send_class_reminders` + a `_send_system_message` backstop (all).

## Insights

- Explicitly NOT the same mechanism as `student_availability_service.py`
  (PAD-28/PAD-107): that module answers "is this student free during
  THIS class window" (time-scoped, coach never sees the details); this
  module answers "does this student want to be asked at all"
  (time-independent, and the reason IS coach-visible by design so a
  coach can tell "deliberately silent" from "ignoring me"). The two
  compose ADDITIVELY at every enforcement point — a solicitation is
  suppressed if EITHER says so — and the module docstring warns
  explicitly not to route one through the other's helpers.
- The enforcement table in the module docstring documents a defense-
  in-depth design: the early filters (eligibility-list filtering) are
  the REAL enforcement; a later choke-point backstop
  (`_send_system_message`) exists only as a safety net, because
  blocking solely at delivery time would leave a `NotificationEvent`
  row marked "sent" with no message behind it — a vacancy stuck waiting
  forever on a reply that structurally can never arrive.
- `notification_block_payload`'s `notificationsBlocked` field is always
  DERIVED (`auto or manual or every`), never stored, specifically so it
  can never disagree with the three underlying flags — and its return
  keys must match exactly what `Player.coach_player_info` (elsewhere)
  returns, or the coach-facing "blocked" badge disappears on one of the
  two surfaces that render it.
