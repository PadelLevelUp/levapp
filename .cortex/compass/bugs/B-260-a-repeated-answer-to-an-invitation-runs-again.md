---
id: B-260
title: "A repeated answer to an invitation ran again: a second \"no\" invited another student, a second \"yes\" told the winner the spot was filled"
type: incomplete-rule
severity: medium
status: resolved
resolved: 2026-10-02T14:13:17Z
affects:
  - notifications.invitations
  - backend/padel_app/services/notification_service.py
proposed_fix: "respond_to_notification takes an answer once: a \"no\" on an invitation no longer live and a \"yes\" on one already confirmed change nothing, decided on the invitation re-read under the vacancy lock."
opened: 2026-10-02T14:13:17Z
---

# B-260: a repeated answer runs again

**Source:** PAD-493, found while enumerating `trigger_invitations`' repeat callers (B-259). The
coordinator asked for a red test of the repeated "no".

**Reproduced** in `test_pad493_invitations_run_twice.py`, on staging `0305880a1`:

1. **A repeated "no"** (double tap, client retry) on one invitation. Live invitations went from
   `[(1, 2), (1, 3), (1, 4)]` to `[(1, 2), (1, 3), (1, 4), (1, 5)]`: the second "no" ran
   `_send_next_on_decline` again and invited a fifth student. It also posted the coach's decline
   message a second time and overwrote the invite message's recorded answer.
2. **A repeated "yes"** from the student who won the spot. The second answer returned
   `spot_filled_waiting_list_offered`: the winner was told the spot was filled, was offered the
   waiting list, and their `confirmed` invitation was set to `expired`. They still held the spot.

**Root cause:** `respond_to_notification` never checked the invitation's own status. The "no" branch
always expired it and sent the next invitation. The "yes" branch saw the vacancy the winner had
filled as "not open" and took the spot-filled path.

**Root-cause class:** the invitations spec described one answer per invitation and was silent on a
second one. Incomplete rule.

**Production:** not visible in the history read. The decline loop on class 367 (2026-08-27) was
B-056, a decline on a *different* invitation each time, fixed on 2026-09-10. Clients hide the
Yes/No buttons once an answer is recorded, so a repeat needs a double tap or a retried request.

### Change Plan

- Spec: `notifications.invitations` rule 17 ("An answer is taken once") and its criterion.
- Code (`notification_service.py`):
  - `_repeated_answer` locks the vacancy (rule 10's order), re-reads the invitation, and returns
    `{"action": "declined"}` / `{"action": "confirmed"}` without writing anything when the
    answer was already given.
  - A "no" marks its invitation `expired` and flushes while that lock is held. Before this, the
    invite message's save committed and released the lock while the invitation was still
    `sent`.
  - A "yes" re-reads the invitation under rule 10's lock, and marks it `confirmed` before
    `_close_vacancy`. Closing retires the other candidates' messages, whose saves commit and
    end the lock; a second tap waiting on it found a filled vacancy and a `sent` invitation.
- Tests:
  - the two B-260 tests in `test_pad493_invitations_run_twice.py`, red on `0305880a1`, green
    after;
  - two Postgres race cells in `test_pad493_starts_and_pacing.py` (a double "yes" and a double
    "no" at once, forced by a gate after the repeat check). Both were red before the
    lock-window fix: the second "yes" got `spot_filled_waiting_list_offered`, and the double
    "no" invited one student twice for the spot.

### Resolution

Fixed in PAD-493's PR, together with B-259. A "no" on a `confirmed` invitation is now the same
no-op (rule 17, tested). Left for PAD-495: `coach_respond_to_notification` (the coach recording
an answer for a student) has the same shape and is not guarded here.

Scope, stated exactly: the same answer given twice is answered once. Not covered: a "yes" after
the student's own "no" on the same invitation still enrols them while the spot is open (the
owner's decision that a "no" is final for the class is PAD-497); a student who lost the spot
and answers "yes" again is told `spot_filled` and offered the waiting list each time (PAD-495).

Seen while fixing, not fixed here: PAD-261's accept comment says the vacancy and class locks end
at the enrolment's commit. In fact `_close_vacancy` commits earlier, through the retired
messages' saves, so the class lock ends before the winner is enrolled. A second accept on a
*different* vacancy of the same class could then count capacity without the first enrolment.
Not reproduced; filed as PAD-495.
