---
id: B-022
title: "The waiting_list_offer message had no Yes/No, so the only self-service route onto the waiting list was unreachable in both apps"
type: layer-drift
severity: medium
status: resolved
affects:
  - frontend/apps/web/src/components/messages/MessageBubble.tsx
  - frontend/apps/mobile/src/features/messages/components/message-bubble.tsx
  - frontend/packages/api/src/resources/notificationEngine.ts
  - backend/padel_app/services/notification_service.py
proposed_fix: "Render waiting_list_offer as a third actionable message type in both bubbles against the existing respond_waiting_list endpoint, and mark the offer message answered server-side."
opened: 2026-08-07T12:02:26Z
resolved: 2026-09-06T18:00:00Z
---

# B-022 — `waiting_list_offer` was a question nobody could answer

`_offer_waiting_list()` sends a student a `waiting_list_offer` chat message on the "sorry, that
spot was just filled" path, and `POST /api/app/notify/respond_waiting_list` has always been able to
act on the answer. Neither client ever rendered the Yes/No:

- `respond_waiting_list` had **zero callers** across `apps/web/src`, `apps/mobile` and
  `packages/api` — the only hits for the string were in the settings message-template editor.
- Both `MessageBubble`s branched on `notification_invite`, `notification_reminder` and
  `replacement_approval` only, so the offer rendered as a plain text bubble.

The consequence is `notifications.waiting-list` rule 1: `WaitingListEntry` rows with
`standing_entry_id IS NULL` — the student-initiated half of the waiting list — could never be
created through the product. The waiting list was coach-managed only, despite the spec describing
a student join path. A spec rule describing behaviour that has never been reachable is the actual
failure mode here; the endpoint working in isolation hid it.

**Resolved 2026-09-06 (PAD-124):** the product owner's 2026-09-04 decision was to wire it rather
than retire it, keeping it separate from `classes.join-requests` (PAD-130/131). Both bubbles now
render Yes/No for the recipient against `respondToWaitingList()` in `packages/api`.

A second, smaller defect surfaced during the build: `respond_to_waiting_list()` never wrote
`responded`/`response` back onto the offer message the way `respond_to_reminder()` does, so the
settled bubble would have lived only in client state and the Yes/No would reappear on reload.
`_mark_waiting_list_offer_responded()` fixes that and publishes the usual `message_edited` event.

Pinned by `backend/padel_app/tests/test_waiting_list_offer_response.py`,
`frontend/apps/mobile/src/features/messages/waiting-list-state.test.ts`, and
`frontend/apps/web/e2e/notification-engine/waiting-list-offer.spec.ts`. Spec: `notifications.waiting-list`
rules 1 and 1a.

*Found by the codebase audit that filed PAD-124, 2026-08-07.*
