---
path: backend/padel_app/services/messaging_service.py
extracted_at: 2026-09-03T13:58:46Z
extraction_level: 2
size_lines: 347
size_tokens: 2871
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "c1cc42b6281d2c7e201fff7154df08fc53a0924b55d433088bac37bc6ec03a54"
---

## Purpose

The direct-messaging domain: conversation lookup/creation (dedup keyed
by a sorted-participant `participant_key`), message send/edit/delete
(soft-delete), reactions, blocking (mutual, idempotent), unread counts,
and message reporting. Every mutation that changes message/conversation
state also does a real-time fan-out via `realtime.publish` and, for new
messages, dual push delivery (web push + Expo native push).

## Connections

- Uses: `padel_app.models` (`Message`, `MessageReaction`, `MessageReport`,
  `BlockedUser`, `Conversation`, `ConversationParticipant`, `User`,
  `Coach`); `padel_app.realtime.publish`;
  `padel_app.serializers.message.serialize_message`;
  `padel_app.utils.push_notifications.send_push_notification`;
  `padel_app.utils.expo_push.send_expo_push_to_user`;
  `padel_app.utils.dates.utcnow_naive`; `padel_app.tools.request_adapter.JsonRequestAdapter`.
- Used by: messaging routes (outside this scope, in the API layer).

## Insights

- `create_message_service` stamps `sent_at` with `utcnow_naive()`
  (UTC) rather than any local time, specifically because
  `mark_conversation_read_service` also stamps `last_read_at` in UTC and
  the unread-count query compares `sent_at > last_read_at` directly — a
  local-time stamp made freshly-sent messages appear ~1h in the future
  under a +1 offset, leaving a just-read message stuck "unread" until
  UTC caught up (PAD-66).
- The Expo push in `create_message_service` sends the recipient's real,
  freshly-recomputed unread total as the iOS badge (via
  `get_unread_count`, called AFTER `message.create()` has committed) —
  not an increment — specifically so the badge self-corrects even if an
  earlier push silently failed to deliver (PAD-153); see also
  `ios-badge-has-no-lifecycle` — nothing clears this badge on read.
- `_messageable_target_ids_for` encodes the messaging graph directly:
  a coach may only START a new conversation with players belonging to
  clubs the coach is in; anyone else (student/player) may start one with
  any active coach. This is enforced only for STARTING conversations
  (`_assert_messageable`, called from `create_conversation_service`) —
  it does not restrict messaging within an already-existing conversation.
- `create_conversation_service`'s `is_group` flag has a documented PAD-93
  history: `participants` always includes the creator, so the naive
  `len(participants) >= 2` check was true for every 1-on-1 DM; this bug
  was masked for the app's entire life because the boolean form field
  coerced `True` back to `False` (PAD-69) until real booleans started
  surviving the form layer, at which point the underlying set-based
  `len(set(participants)) > 2` check had to actually be correct.
