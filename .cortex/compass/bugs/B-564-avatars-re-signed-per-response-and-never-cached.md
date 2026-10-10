---
id: B-564
title: "Every response re-signed every image (an IAM round trip each on the VM) under a new URL, so no client cached it; participantAvatar was always null"
type: wrong-rule
severity: medium
status: triaged
affects:
  - .specflow/specs/messaging/messages.spec.md
  - .specflow/specs/messaging/conversations.spec.md
  - backend/padel_app/model.py
  - backend/padel_app/serializers/conversation.py
  - backend/padel_app/services/messaging_service.py
proposed_fix: "Per-process cache of the signed URL per object key for 50 minutes (URL lives 60), failures remembered for 60 s; participantAvatar reads user_image_url with the image joined into the list query."
opened: 2026-10-10T03:20:00Z
---

# B-564: images re-signed per response, never cached; participantAvatar always null

> Ledger id **unconfirmed** (wave-14 range B-561–580; B-561–B-563 are on sibling branches, so
> this index line sits after B-464 here).

**Source:** PAD-593, filed by the PAD-571 speed study (code at 4757c13d9).

**What happens:** `Image.url()` minted a fresh V4 signed URL for every private image in every
payload, which is what `messaging.messages` rule 5a said ("minted per response"). On the VM each
signing is an IAM `signBlob` round trip (PAD-197). A class detail with eight photographed
participants cost eight round trips per open, and `/users` and `/messageable-users` one per user
with no cap. A V4 URL embeds its date and signature, so the same photo had a new URL every time
and no browser or iOS image cache ever hit. A failing signer was retried on every image of every
payload. Separately, the conversation list's `participantAvatar` read `avatar_url`, which no
model defines, so it was always `null` even though web and iOS both render it.

**What should happen:** rule 5a as amended: one signing per object key per 50 minutes per
process, the same URL within that window, and a 60-minute URL so a reused one has 10 minutes
left. Rule 5b: a failure is not retried for that image for 60 s. `messaging.conversations`
rule 5a: `participantAvatar` is the participant's photo, loaded with the participant.

**Evidence (Phase 1):** `test_pad593_signed_url_cache.py` against staging 81badc6a1, with only
the constants and a no-op reset stubbed in. Four signing tests failed on their assertions: the
same key signed twice gave `?n=2` vs `?n=1`, eight participants twice cost 16 signings, and a
failure was retried at once. The list test failed with `participantAvatar` `None`. The rule
itself prescribed per-response minting, so this is Type 3 (wrong rule), not a code slip.

**Affected specs:** `messaging.messages` rules 5a/5b and a new criterion,
`messaging.conversations` rule 5a and a criterion, and a business line in
`user-and-coach-message-in-real-time`.

### Change Plan
- Rule 5a/5b amended; criteria added (done in this branch).
- `model._cached_signing` (lock, bounded at 5,000 keys, `_monotonic` clock for tests) behind
  `Image.url()`; conftest resets the cache around every test.
- `serialize_conversation` reads `participant.user_image_url`; `get_user_conversations` joins
  `User.user_image`, so the list stays constant in statements (PAD-204 rule 12, pinned).
- The cache is per process: with several gunicorn workers each signs an image once per
  window, so a client can see up to one URL per worker in 50 minutes (still a bounded number,
  where before it was one per response).
- Web and iOS already render `participantAvatar` (web `ConversationList`, iOS
  `conversation-item`), so no client change ships; iOS's thread header has no avatar slot (an
  existing layout difference, out of scope).
- Not chosen: the `/api/app/image/<id>` 302 route. The cache gives the same stable URL without
  a new endpoint or a client change.

### Resolution

(filled in when the PR lands)
