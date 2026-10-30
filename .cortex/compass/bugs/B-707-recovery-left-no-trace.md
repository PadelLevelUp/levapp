---
id: B-707
title: "Password recovery left no trace of a sent mail, erased the trace of a failed one, and a padded stored address never matched"
type: incomplete-rule
severity: medium
status: resolved
resolved: 2026-10-30T09:45:00Z
affects:
  - backend/padel_app/services/password_recovery_service.py
  - backend/padel_app/tools/mail_dispatch.py
  - backend/padel_app/services/player_invitation_service.py
  - backend/padel_app/services/registration_service.py
  - backend/padel_app/services/user_service.py
  - .specflow/specs/auth/password-recovery.spec.md
proposed_fix: "Log a sent recovery mail and the reason a request sent nothing; keep the attempt's time when a send fails; store every email through one normalising helper and rewrite the old rows once."
opened: 2026-10-28T22:00:00Z
---

# B-707: an "I never got the email" report could not be answered from prod

**Source:** PAD-781, found while mapping the recovery mail path for a student support case
(2026-10-28).

**What happened:**
1. A sent recovery mail logged nothing. A request that matched no recoverable user (no account, no
   password, disabled) or fell inside the 60-second cooldown answered the same 200 and logged
   nothing.
2. A failed send logged a WARNING, recorded an incident, then cleared `password_reset_sent_at` with
   the code. Once the 15-minute window passed, "never attempted", "sent" and "lost in flight"
   looked the same in the database and the log.
3. The coach-created student path and the student's invite accept stored the email as typed, while
   every lookup compares a trimmed, lower-cased address with `lower(users.email)`. A stored address
   with a space around it never matched: recovery answered 200 and sent nothing, and login by email
   failed the same way.

**Fix (auth.password-recovery rules 3a, 5a, 12):**
- `mail_dispatch` logs `<label> sent` at INFO after a send, so every after-commit mail leaves a
  trace (`recovery mail to user <id> sent`).
- `request_recovery` logs `recovery request sent nothing: <reason>` for `no_user`, `no_password`,
  `disabled` and `cooldown`. The address is never logged (B-254).
- A failed send clears the code and its expiry and keeps `password_reset_sent_at`.
- `utils/emails.normalise_email` is the one stored form; sign-up, the profile edit, the coach-created
  student and the invite accept all write through it. Revision 13395db9fee4 rewrites the older rows:
  idempotent, skipping a row whose normalised form another account holds, and reversible through
  the originals it keeps.

**Evidence (prod, read-only, 2026-10-30):** 1 stored address differed from its normalised form
(case only, so the case-insensitive lookup already matched it). 0 were padded, 0 blank, and 0 would
collide.

**Test:** `test_pad781_recovery_leaves_a_trace.py`: 10 red on staging e2aad1ed2 (no log lines, the
time cleared, the address stored as typed, no helper); 1 control green (a retry after the cooldown
issues a new code). All 11 pass with the fix. `test_pad781_email_normalising_migration.py`: 5 cases
on SQLite and Postgres.
