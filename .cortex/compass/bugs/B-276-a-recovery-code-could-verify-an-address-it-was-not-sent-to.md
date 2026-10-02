---
id: B-276
title: "A password-recovery code issued before an email change could mark the new address as verified"
type: incomplete-rule
severity: high
status: resolved
opened: 2026-10-02T17:48:54Z
resolved: 2026-10-02T17:48:54Z
updated: 2026-10-02T17:48:54Z
affects:
  - auth.password-recovery
  - backend/padel_app/models/users.py
  - backend/padel_app/services/password_recovery_service.py
proposed_fix: "Discard a pending recovery code on any write that changes or clears the account's email."
---

# B-276: a recovery code could vouch for an address it was not sent to

**Source:** the independent review of PR #509 (PAD-482), 2026-10-02; reproduced at that head and
present before it. Ticket PAD-498.

**What happens (class of problem; the exact sequence is in the coordinator's notes, not here):**
confirming a password recovery marks the account's current email as verified (`auth.password-recovery`
rule 6). The code was not tied to the address it was mailed to, and changing or clearing the account's
email did not discard it. A code received at one address could therefore end up marking a different
address, set on the account afterwards, as verified, although nobody proved they own it.

**Evidence:** `test_pad498_recovery_code_and_email_change.py`, red on staging 4a77b1134 for both the
change path and the clear-then-add path (the code confirmed, the new address read verified).

**Root cause (diagnostic tree):** rule 6 grants verification on a confirmed code; no rule said what
happens to a pending code when the address it was sent to stops being the account's. Type 2, incomplete
rule.

### Change Plan
- Spec: `auth.password-recovery` rule 11 and two criteria.
- Code: a `set` listener on `User.email` (`active_history=True`) discards a pending code on any change
  or clear, whatever writes the email; same address in another case is not a change.

### Resolution (PAD-498)

- **Spec:** `auth.password-recovery` rule 11 with two acceptance criteria.
- **Code:** `models/users.py` `_email_change_discards_recovery_code`.
  - The listener is on the model, so it covers every path that writes the email: the profile, activation, a claim, a deletion, a form.
  - `active_history=True` loads an old value that a commit has expired, so a write that never read the address is still seen as a change.
- **Tests:** `test_pad498_recovery_code_and_email_change.py` (6 tests):
  - a change of address, and a clear followed by a new address, each make the old code answer 410 with nothing verified and the password unchanged;
  - the same address in another case keeps the code;
  - a recovery on an unchanged address works as before;
  - a write of the email through the ORM discards the code;
  - so does a write after a commit expired the attribute (red without `active_history`).
