---
id: B-032
title: "respond_waiting_list never checks the caller was offered the list"
type: incomplete-rule
severity: high
status: fixed
affects:
  - notifications.waiting-list
  - backend/padel_app/services/notification_service.py
  - backend/padel_app/modules/notification_engine_api.py
proposed_fix: "Require a matching unanswered waiting_list_offer for (player, instance) and 403 otherwise; state it as a rule on notifications.waiting-list."
opened: 2026-09-06T00:00:00Z
resolved: 2026-09-09T00:00:00Z
---

# B-032 — respond_waiting_list never checks the caller was offered the list

**Root cause.** `respond_to_waiting_list()` only checked that the JWT resolved to a `Player`,
then upserted a `WaitingListEntry` for `(lesson_instance_id, player.id)`. Any authenticated
player could POST an arbitrary `lessonInstanceId` and queue on any class of any coach. Found by
the PAD-124 verification (PR #68); pre-existing, but PAD-124's Yes/No button made the endpoint
discoverable. Linear: PAD-222.

**Fix (PAD-222, 2026-09-09).** `notifications.waiting-list` rule 12: the endpoint requires an
unanswered `waiting_list_offer` for that player and instance (a read-only lookup that never
creates a conversation) and answers 403 otherwise, before the PAD-68 late-instance branch.
Tests in `test_waiting_list_offer_response.py`.

*Filed 2026-09-09 from the PAD-222 ticket; fixed in the same PR.*
