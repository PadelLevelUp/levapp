---
id: B-693
title: "A student invited again was listed with the old invite's state, and a manual invite lost to a full class read 'Expirou' while its bubble read 'Vaga preenchida'"
type: wrong-rule
severity: medium
status: resolved
affects:
  - calendar.event-detail
  - backend/padel_app/serializers/lesson.py
  - backend/padel_app/services/notification_service.py
  - frontend/apps/web/src/components/calendar/ClassDetailSheet.tsx
proposed_fix: "Rule 8: an accepted invite wins, otherwise the most recently created record. Rule 16: a record retired because its spot or class filled carries retired_reason spot_filled, which the list reads."
opened: 2026-10-28T15:00:00Z
resolved: 2026-10-28T16:00:00Z
---

# B-693: the invited list showed the old invite

**Source:** the owner's report of 27/10 (Linear PAD-773), a coach's class of 28/10.

**What happens:**
- A waiting-list student (case 11) was invited by hand at 20:08. Another student's request to join
  took the spot, so the bubble read "Vaga preenchida".
- That student then said "Não vou", and the engine invited case 11 again at 21:18.
- The class's invited list showed case 11 as "Expirou": the 20:08 invite, while a new one waited.

**What should happen:** one row per student with the newest invite's state ("Ainda sem
resposta"), and the same word in the list and the chat for an invite lost to a filled spot.

**Root cause:**
- Wrong rule (rule 8): the tie-break ranked `confirmed > expired > sent > queued`, reading `expired`
  as "an explicit decline". `expired` is also a spot filled, a timeout or a class that is over, so
  an old expired invite outranked a newer pending one. The sentence "an actual response always beats
  a still-pending invite" is dropped. The engine never re-invites a student who said no (PAD-576),
  so a newer pending invite after a "no" only exists when the coach invites by hand again, and then
  the new invite is what the coach wants to see.
- Incomplete rule (rule 16): an expired invite read "Vaga preenchida" only when its vacancy was
  `filled`. A manual invite has no vacancy, so when the class filled (PAD-609) its bubble said
  `spot_filled` and its row said `expired`.
- Also found: batches sent later (the tick's next batch, a decline's follow-up) published no
  `notify_sent`, so the coach's open class did not show them. Web's `notify_sent` handler also read
  whichever class the event named into the open sheet.

**Fix:** rule 8 replaced; rule 16 gains `retired_reason = "spot_filled"`, set in
`_retire_invite_message` and `_broadcast_spot_filled`'s fallback; `_send_batch_locked` publishes
`notify_sent`; web ignores `notify_sent` for another class. Old rows keep their label (no backfill:
those classes are past). Tests: `test_pad773_invited_list_follows_the_newest_invite.py`,
`test_class_guest_list_dedupe.py` (updated for rule 8), and the web sheet test.
