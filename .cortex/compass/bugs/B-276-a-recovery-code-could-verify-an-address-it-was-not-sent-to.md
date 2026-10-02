---
id: B-276
title: "A password-recovery code issued before an email change could mark the new address as verified"
type: incomplete-rule
severity: high
status: resolved
opened: 2026-10-02T17:48:54Z
resolved: 2026-10-02T18:28:25Z
updated: 2026-10-02T18:28:25Z
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
- Spec: `auth.password-recovery` rule 11 and three criteria; `auth.email-verification` rule 3.
- Code: bind each code to the address it was mailed to (the address is in the HMAC input, checked at
  confirm). Keep a `set` listener on `User.email` as defence in depth, and clear both codes in the
  staging-sync bulk rewrite.

### Resolution (PAD-498)

- **First round:** a `set` listener on `User.email` that discards a pending recovery code on any ORM
  change or clear of the address.
  - The independent review (#518) showed it orders writes but cannot close an overlap: an email change
    committed while the code's mail is being sent leaves a live code on the new address. It reproduced
    this with two sessions.
- **Second round, the fix:**
  - **Binding:** the recovery code and the email-verification code are now bound to the address they
    were mailed to. The trimmed, lower-cased address is part of the HMAC input
    (`password_recovery_service._hash`, `email_verification_service._hash`), and confirm checks it
    against the account's current address. This holds whatever order the writes land in.
  - **The listener stays as defence in depth:** it covers every ORM writer of the email.
    - It no longer uses `active_history`, which would raise on a detached instance.
    - An old value that isn't loaded counts as a change.
  - **Staging-sync:** the bulk rewrite in `sync-staging-db.sh` clears both codes in the same statement.
- **Tests:** `test_pad498_recovery_code_and_email_change.py`, 11 tests.
  - Red first on staging 4a77b1134:
    - a change of address;
    - a clear followed by a new address;
    - an overlapping email change, for both kinds of code.
  - Also covered:
    - the same address in another case (through the profile and through the ORM);
    - a recovery on an unchanged address;
    - an ORM write, and a write after a commit expired the attribute;
    - a detached instance does not raise;
    - the staging-sync statement clears both codes.
  - Mutants: binding removed, case-sensitive compare, and `active_history` restored are each red.
