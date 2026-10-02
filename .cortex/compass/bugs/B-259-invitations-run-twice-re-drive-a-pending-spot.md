---
id: B-259
title: "trigger_invitations is not safe to run twice: a repeat re-batches or expires a spot whose invitations are pending, and a student can be invited twice for one spot"
type: incomplete-rule
severity: high
status: resolved
resolved: 2026-10-02T14:13:17Z
affects:
  - notifications.invitations
  - backend/padel_app/services/notification_service.py
  - backend/padel_app/modules/frontend_api.py
proposed_fix: "trigger_invitations starts a vacancy at most once, under a row lock, and leaves a started vacancy to process_invitation_batches (rule 1b); a vacancy whose rounds run out while an invitation is live holds open instead of expiring (rule 16)."
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

**Production (read-only reads run by the coordinator, 2026-10-02 13:53–14:00Z):** nothing is exposed
now; no invitation is live. In history, B-259's pacing break shows in vacancies whose batch 2 went
out seconds after batch 1 while batch 1 was still unanswered: 30 s, 83 s (exactly the
two-declines shape), 0.7 s, 3 s, and under 1 s on four more. Correct pacing was about 2 h. The
expiry shape shows in almost every expired vacancy of the history read: invitations stayed live
until the bulk expiry of 2026-07-23. In two classes a departing student's seat was offered again
while an older offer to the same student was still live. No "yes" was ever refused on an expired
vacancy; a first reading said two were, and was retracted, because the query read the vacancy's
current status, not its status at the answer. The class-367 evening of 2026-08-27 was B-056 and
PAD-271, both fixed in September, plus the cross-spot design (PAD-494).

**Spec/code mismatch, noted and not fixed here:** rule 5 says the engine "expires unanswered
invitations after maxInactiveTime". The code never expires an invitation before the class starts
(PAD-68's sweep); `maxInactiveTime` only paces the next batch. Under rule 16, "the last live
invitation resolves" therefore means it is declined, or the class starts.

### Change Plan

Design reviewed and approved by the coordinator before the build (F1 start-only, F2 hold,
cross-spot split out as PAD-494).
- Spec: `notifications.invitations` rule 1b ("Starting is once per vacancy") and rule 16 ("A spot is
  not dropped while someone asked can still say yes"), with four criteria.
- Code (`notification_service.py`):
  - `_start_vacancy` claims the start in its own short transaction: it locks the vacancy
    (`SELECT … FOR UPDATE`), re-reads it, stamps `last_activity_at` on an open, never-started
    vacancy and commits; only then is the batch sent. Both `trigger_invitations` and the tick's
    fresh-vacancy branch go through it. A batch that sent nothing and advanced no round
    (`maxTotal` used up) clears the stamp, so the next tick retries. Review of #507 found the
    first version (one unit of work around claim and batch) left such a vacancy waiting
    `maxInactiveTime`, or never retried with it off, and submitted pushes before the commit.
    Second review: a batch that raised, or a process that died after the claim, left the same
    stall. A raise now gives the claim back (re-locked, only if unchanged), and an abandoned
    claim lapses after `START_CLAIM_LEASE` (10 minutes).
  - `_find_or_create_open_vacancies` creates a vacancy for each absent student without one even
    while another vacancy of the class is open (never-filled places unchanged), only as many as
    the absences free: an absence on an over-full roster creates none. Review of #507: a student marked absent while another spot held got no vacancy;
    the gap existed before but the hold widened it.
  - `_defer_next_round` holds a vacancy on its last round while `_has_live_offers` is true,
    instead of expiring it.
- Tests: `test_pad493_invitations_run_twice.py` (red on `0305880a1`, green after), and
  `test_pad493_starts_and_pacing.py`:
  - every legitimate start, each first call × repeat, run on the old and the new code;
  - the pacing guard;
  - the lock spy and a stale-row cell;
  - a forced two-thread race on Postgres, with an unlocked cell that double-sends.

### Resolution

Fixed in PAD-493's PR. Not covered here, by decision:
- the same students invited for every spot of a class: PAD-494;
- a decliner asked again for the same spot in a later round: by design under rule 8, and a product
  question.
- PAD-495: two different students declining one vacancy at once can both invite the same next
  student, and a vacancy whose first batch `maxTotal` stops now waits `maxInactiveTime` before
  the tick retries it, instead of 2 minutes.
