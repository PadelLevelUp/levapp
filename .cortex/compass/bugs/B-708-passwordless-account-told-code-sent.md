---
id: B-708
title: "An account with no password (Google/Apple sign-in, unfinished invite) was told \"code sent\" on password recovery and received nothing"
type: incomplete-rule
severity: medium
status: resolved
resolved: 2026-10-30T09:50:00Z
affects:
  - backend/padel_app/services/password_recovery_service.py
  - backend/padel_app/services/player_invitation_service.py
  - backend/padel_app/tools/email_templates.py
  - .specflow/specs/auth/password-recovery.spec.md
proposed_fix: "Keep the one 200 and send these accounts a mail that says what to do: the provider to sign in with, or a fresh invite link (option (a), assumed)."
opened: 2026-10-28T22:00:00Z
---

# B-708: a passwordless account asked for a recovery code and heard nothing back

**Source:** PAD-782, found while mapping the recovery mail path for a student support case
(2026-10-28).

**What happened:** `_find` skipped every account whose password is NULL, and the endpoint answered
the same 200 "code sent" as a real send (the enumeration guard, rule 2). Two kinds of account have
an email and no password: a Google/Apple sign-in account, and a coach-created student who never
finished the invite. Both saw "code sent" on web and iOS and got nothing, with nothing telling them
what to do. Rule 5 ("any user with an email and a password") made it intended, so the rule was
incomplete rather than the code wrong.

**Fix (auth.password-recovery rule 5b, option (a) assumed):** the response stays the standard 200
and no code is issued. One mail goes to the address: the provider to sign in with, or a fresh 7-day
invitation link from the student's coach. It obeys the per-email cooldown.

**Reach on prod (read-only, 2026-10-30):** 0 accounts. Every passwordless account has no email,
there are no Google/Apple identities, and there are no player invitations. So this did not cause the
support case that found it. It guards the two paths that make it real: social sign-in reaching users,
and a coach-created student with an email who does not finish the invite.

**Test:** `test_pad782_passwordless_recovery_help_mail.py`: 6 red on staging e2aad1ed2 (no mail);
4 controls green (disabled, orphan, confirm 410, a password account still gets its code). All 10 pass
with the fix, on SQLite and Postgres.
