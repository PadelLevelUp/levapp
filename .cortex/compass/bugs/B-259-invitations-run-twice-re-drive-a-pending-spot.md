---
id: B-259
title: "trigger_invitations is not safe to run twice: a repeat re-batches or expires a spot whose invitations are pending, and a student can be invited twice for one spot"
type: incomplete-rule
severity: high
status: triaged
affects:
  - notifications.invitations
  - backend/padel_app/services/notification_service.py
  - backend/padel_app/modules/frontend_api.py
proposed_fix: "Pending the coordinator's review of the design: trigger_invitations starts a vacancy at most once (round 1 to a never-batched vacancy) and leaves a vacancy already sending to process_invitation_batches."
opened: 2026-10-02T13:51:27Z
---

# B-259: invitations re-driven by a repeat call

**Source:** PAD-493. Session-A measured it on 2026-10-02 with a scratch probe while working on PAD-478
part 2. Session-B diagnosed it the same day.

**Reproduced** with `test_pad493_invitations_run_twice.py` (pinned clock, class tomorrow 09:00,
invitation window open, one round, batches of 3). Both tests are red on staging `0305880a1`.

1. **Direct, Session-A's shape.** One spot, one eligible student, three calls of
   `trigger_invitations`:
   - after call 1 the vacancy is `(1, open, round 1, batch 1)` with 1 live invitation;
   - after call 2 the vacancy is `(1, expired, round 2, batch 1)`, and the invitation is STILL
     `sent`;
   - after call 3 a second vacancy appears, `(2, open, 1, 1)`. The live invitations are
     `[(vacancy 1, player 1), (vacancy 2, player 1)]`: the same student holds two live invitations
     for one spot.
2. **Two declines five minutes apart**, through the production path `respond_to_reminder("no")`.
   The class has 2 places; 2 students are enrolled; 5 other students are eligible:
   - decline 1 creates vacancy 1 and invites players 3, 4 and 5 (batch 1);
   - decline 2, five minutes later, re-drives vacancy 1 to **batch 2 at once**, inviting players 6
     and 7. That skips the inactivity interval (default 120 min) that `process_invitation_batches`
     owns (rule 5);
   - vacancy 2 then invites players 3, 4 and 5 **again**. Within five minutes each of them holds
     two live invitations for the same class, one per spot.
   - With fewer candidates the second decline finds nobody new for vacancy 1. It then advances the
     round and, past the last round, expires vacancy 1 under its pending invitations, as in shape 1.

**Root cause (observed):**
- `trigger_invitations` (`notification_service.py` ~3939) runs `_send_invitation_batch` on EVERY
  sendable open vacancy of the class on every call. Nothing records that a vacancy has already
  started.
- The dedupe in `_get_eligible_students_for_group` (~1151–1160) is per vacancy: players with a live
  invitation for THIS vacancy, or any invitation in its current round. So a repeat call sends the
  next batch to new candidates (pacing skipped). With none left, `_defer_next_round` advances the
  round and expires the vacancy past the last round, leaving its invitations `sent`.
- An expired vacancy no longer counts as open, so the next call's `_find_or_create_open_vacancies`
  creates a fresh vacancy for the same spot. Its own dedupe is empty, so it invites the same students
  again.
- **Harm a student can see:** a yes to an invitation whose vacancy was expired this way takes the
  `vacancy.status != "open"` branch of `respond_to_notification` (~4319). The student is told the
  spot was filled although it is still open, and may then be invited again for that spot.

**Callers that repeat in production** (survey by a sonnet agent; each line re-read by Session-B):
- the `invite_start_{id}` DateTrigger job: once per arming. A config save re-arms it with
  `replace_existing`;
- every student decline: `respond_to_reminder` "no" and `cancel_attendance`, both through
  `_free_spot_for_declining_player` (~3392). Its guard `_vacancy_has_live_invitations(vacancy)` checks
  only the decliner's NEW vacancy, then calls `trigger_invitations` for the whole class;
- the coach's attendance confirm, `confirm_presences` (`frontend_api.py` ~2502): no guard at all;
  a double click is a repeat;
- semi-automatic approval (`respond_to_approval`): a second bundle for the same class.
- `process_invitation_batches` never calls `trigger_invitations`. It is the pacer, at most one batch
  per vacancy per tick.

**Root-cause class:** `notifications.invitations` rule 1 says the trigger "creates a Vacancy and
starts matching" and says nothing about a second call. The pacing rule (rule 5) assumes it alone
sends later batches. Incomplete rule.

**Production:** not yet known. The read-only query is
`docs/qa/2026-10-02-pad-493-prod-read.sql` (local, untracked); the coordinator runs it. Note: the
direct shape (expire, then recreate a never-filled spot) creates vacancies with no departing player,
so its query counts it under "several spots", not "same spot".

### Change Plan

Held until the coordinator has reviewed the diagnosis and the design (it changes user-visible
notification volume).

### Resolution

(Filled in when the fix lands.)
