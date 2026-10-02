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
- Code: `_repeated_answer` in `notification_service.py`. It locks the vacancy (rule 10's order),
  re-reads the invitation, and returns `{"action": "declined"}` / `{"action": "confirmed"}`
  without writing anything when the answer was already given.
- Tests: the two B-260 tests in `test_pad493_invitations_run_twice.py`, red on `0305880a1`, green
  after.

### Resolution

Fixed in PAD-493's PR, together with B-259. Out of scope, and not checked:
`coach_respond_to_notification` (the coach recording an answer for a student) has the same shape
and is not guarded here.
