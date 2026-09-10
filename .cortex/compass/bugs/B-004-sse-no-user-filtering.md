---
id: B-004
title: "SSE events are broadcast to every connected client"
type: incomplete-rule
severity: high
status: resolved
affects:
  - messaging.sse-realtime
  - backend/padel_app/realtime.py
proposed_fix: "Filter at publish time by recipient user id; the spec rule should state that a client only receives its own events."
opened: 2026-04-14T00:00:00Z
resolved: 2026-09-06T00:00:00Z
---

# B-004 — SSE events are broadcast to every connected client

`publish()` fans every event out to all queues; the frontend filters. Any client can observe events meant for another user. Verify whether per-user filtering was added since April 2026 before acting.

*Triaged 2026-09-03 from the legacy `specflow/bugs.md` (April 2026 onboarding). Status `open` means not re-verified against current code.*

## Re-verification (2026-09-06, PAD-206)

Still present, unchanged. `padel_app/realtime.py` was a module-level
`_subscribers: list[queue.Queue]` with `subscribe()` taking no arguments, so the process
had no idea which user any queue belonged to; `publish(event)` looped over every queue.
Every `message_created`, `message_edited`, `message_deleted` and `message_reaction` —
carrying the full serialized message, text included — reached every connected client.
The web and iOS clients discard events for conversations they are not viewing, which is a
rendering decision made *after* the payload is already on the wire, so it was never a
privacy boundary.

Confirmed by the 2026-09-02 data-model audit (finding H2) and reproduced on the PAD-206
branch: `test_message_created_reaches_participants_only` showed a third, unrelated user's
queue receiving a two-party conversation's message.

## Resolution

Fixed in PAD-206 (branch `feature/pad-206-sse-scoped-participant-authz`).

**Rules added** — `.specflow/specs/messaging/sse-realtime.spec.md`:
- rule 7: a subscription is keyed by the authenticated user id from the JWT; the `/events`
  route registers its queue under `get_jwt_identity()`, and one user may hold several
  queues (tabs, web + phone).
- rule 8: every published event names its recipient user ids and is delivered only to
  their queues. `user_ids` is a **required** argument — `publish(event)` raises
  `TypeError`, so the broadcast behaviour cannot return by omission.
- rule 9: a client never receives an event for a conversation it is not a participant of;
  client-side filtering is a convenience, not the boundary.
- rule 2 restated for the new signatures; the "OPEN: no user-level event filtering" note
  is gone.

**Code** — `backend/padel_app/realtime.py` now holds `_subscribers: dict[int, list[Queue]]`
with `subscribe(user_id)`, `unsubscribe(user_id, q)` and `publish(event, user_ids)`. Every
call site passes recipients: message-shaped events go to the participants of the message's
conversation (`conversation_participant_ids()`), notification-engine events to the coach
and the player they concern. The `{type, payload}` wire shape is unchanged, so no web or
iOS change was needed.

**Tests pinning it** — `backend/padel_app/tests/test_pad206_sse_scoping_and_participation.py`:
`test_publish_delivers_only_to_the_named_recipients`,
`test_publish_without_recipients_is_a_type_error`,
`test_every_queue_of_the_same_user_is_served`,
`test_unsubscribe_removes_only_that_queue`,
`test_message_created_reaches_participants_only`,
`test_edit_delete_and_reaction_reach_participants_only`,
`test_event_shape_is_unchanged`.

**Still true, by design:** the registry is per-process, so production must keep running a
single gunicorn worker — a second worker would hold its own registry and miss the fan-out.
Recorded as a note on the spec rather than fixed here; horizontal scaling needs a shared
broker, which is a separate piece of work.
