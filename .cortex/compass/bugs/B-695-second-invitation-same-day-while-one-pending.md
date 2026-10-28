---
id: B-695
title: "A student with an unanswered invitation was invited to another class the same day: no rule looked at live invitations for other classes"
type: incomplete-rule
severity: high
status: resolved
affects:
  - notifications.invitations
  - notifications.config
  - backend/padel_app/services/notification_service.py
  - frontend/packages/config/src/invitation-waiting-list.ts
proposed_fix: "Invitations rule 18c: while rule 6e is on, every automatic path skips a student with a live invitation for another class that club day (pending_invite_same_day); a yes withdraws the others that day (booked_same_day), not a 'no'; manual invitations are not blocked."
opened: 2026-10-28T12:00:00Z
resolved: 2026-10-28T13:00:00Z
---

# B-695: a second invitation the same day while one is pending

**Source:** the owner's report from a coach, 2026-10-27 (Linear PAD-775). A student invited at
21:18 to a class at 12:00 the next day, not yet answered, was invited at 22:03 to another class the
same day at 13:30. Both stayed "A aguardar resposta".

**What happens:** `evaluate_candidates` skips a student who holds a spot in another class that day
(config rule 6e, presences only) and one holding a live invitation for another spot of the SAME
class (rule 18, `offered_another_spot`). Nothing looked at a live invitation for a different class
that day, so both invitations passed every stage (reproduced in tests on staging aa4f8fde).

**What should happen:** one live offer per student per club day; a yes closes the others that day.

**Root cause:** no rule covered it (incomplete rule). The owner's decision of 2026-10-27 (same day
only; manual invitations not blocked) and the coordinator's (follows rule 6e; any coach) are rule 18c.

**Fix:** stage `pending_invite_same_day` (`_same_day_live_offers`); `_withdraw_same_day_offers` in the
student's and the coach-recorded yes, reason `booked_same_day` (16-character column; the
coordinator chose it over a migration). Client label through the shared `retiredInviteLabelKey`
and shared locales, so web and iOS together.
Test: `backend/padel_app/tests/test_pad775_one_live_offer_per_day.py`.
