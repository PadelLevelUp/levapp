---
id: B-056
title: "A student who declines an invitation is re-invited in the same round"
type: missing-criterion
severity: medium
status: resolved
affects:
  - backend/padel_app/services/notification_service.py
  - .specflow/specs/notifications/invitations.spec.md
proposed_fix: "Treat any earlier invitation to the player for this vacancy in the current round as already used, whatever its status, so a declined or expired invite is never re-sent in that round. Later rounds keep their own rules."
opened: 2026-09-10T00:00:00Z
---

# B-056 — A declining student is re-invited in the same round

**Source:** Session D spotted it while preparing the PAD-273 unique on
`notification_events (vacancy_id, player_id, round_number)`. Session A confirmed it on
2026-09-10 with a failing test (`backend/padel_app/tests/test_b056_no_reinvite_after_decline.py`, 3 of 3 red on staging `96560cc6`).

**What happens:**
- `evaluate_candidates` excludes a player only while their invitation for the vacancy is `sent`,
  `queued` or `confirmed` (`notification_service.py:1139-1147`).
- A decline sets the invitation to `expired`, as a timeout or a filled spot would.
- `respond_to_notification` then calls `_send_next_on_decline`, which invites "the next single
  eligible player" of the same round.
- Ranking uses the coach's priority criteria and attendance only, so the student who was just
  invited first because they rank first is still first. They get a second invitation for the class
  they just declined.
- A coach-recorded decline does the same on the next inactivity batch.
- `_send_invitation_batch` has no per-(vacancy, player, round) check of its own
  (`notification_service.py:3101-3124`).

**Why it matters:**
- The student is asked again, in the same minute, about a class they declined.
- The spot the decline freed is not offered to anyone else.
- Because nobody new is eligible, the round never runs out. So `invitations` rule 8 ("if all
  decline or expire: moves to next round") never fires while the decliner keeps being picked.
- Duplicates like this are what the PAD-273 unique would reject, so the unique cannot land
  before this is fixed.

**Fix:** `evaluate_candidates` also excludes every player who has an invitation for the vacancy in
the round being evaluated, whatever its status. Live invitations from any round (`sent`,
`queued`, `confirmed`) keep excluding as before, and later rounds keep their own criteria. The
matching spec criterion is under `notifications.invitations` rule 8. This is the key the PAD-273
unique on `notification_events (vacancy_id, player_id, round_number)` enforces, so that unique
can follow. Duplicates written before this fix still need PAD-273's prod duplicate scan.
