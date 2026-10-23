---
id: B-684
title: "Sign-up and password-recovery mail ran on the request thread with no SMTP timeout, so a slow or silent mail server held the response (register once 43 s, recovery 3.5 s)"
type: incomplete-rule
severity: medium
status: resolved
affects:
  - backend/padel_app/mail.py
  - backend/padel_app/services/email_verification_service.py
  - backend/padel_app/services/password_recovery_service.py
  - backend/padel_app/services/coach_approval_service.py
  - backend/padel_app/services/request_alert_service.py
proposed_fix: "Commit first, then send off the request thread (tools/mail_dispatch.send_later); give every SMTP connection a timeout (MAIL_TIMEOUT, default 10 s); a failed mail clears its own code and is recorded on engine health."
opened: 2026-10-23T18:39:07Z
resolved: 2026-10-23T18:39:07Z
---

# B-684: sign-up and recovery mail held the request

**Source:** the prod access-log timings of 2026-10-22. Linear PAD-734.

**What happens:** `POST /api/auth/register` took 43 s once (2 of 5 calls over 1 s) and
`POST /api/auth/password-recovery/request` 3.5 s. The user waits for the mail server.

**What should happen:** the response returns at once; a slow, failing or silent mail server
affects only the mail.

**Root cause:** two gaps, neither stated by a rule.
- Recovery and the sign-up's first verification code sent the mail before their own commit,
  inside the open transaction (`password_recovery_service.request_recovery`,
  `email_verification_service.begin_verification`). The User row itself was already committed
  (`registration_service._create_account`'s unit of work), so a mail failure never lost an
  account; it held the request and the code row's transaction.
- Flask-Mail 0.9.1 opens `smtplib.SMTP_SSL(server, port)` with no timeout, and gunicorn's worker
  timeout is 3600 s, so a server that accepts and never answers held a request thread for up to
  an hour. The coach sign-up's admin mails (`coach_approval_service._send`, the request alert)
  ran on the same thread after the commit.
- `auth.register` rule 14 said "inside the same request", and no rule bounded the SMTP wait.

### Change plan (applied)

**Specs:** `auth.register` rule 14, `auth.email-verification` rule 6 and
`auth.password-recovery` rule 3 now say "after the commit, off the request thread". Each has a
criterion for a hung mail server; recovery also has one for the clear-only-your-own-code guard.

**Code:**
- `padel_app/mail.py`: a Flask-Mail `Connection` that passes `MAIL_TIMEOUT` to smtplib.
- `padel_app/tools/mail_dispatch.send_later`: one daemon thread per mail, under the app context.
  It logs `"<label> failed: <class>"` and runs an `on_failure` cleanup. Inline under TESTING
  (`MAIL_DISPATCH_INLINE`).
- Recovery, the sign-up code and the coach admin mails go through it after their commit.
  "Send a new code" stays synchronous because its 503 must reach the caller; the timeout bounds it.

**Tests:** `test_pad734_mail_after_commit.py`. A local socket that never sends the SMTP greeting
proves the timeout and the engine-health incident. A blocked `send_email` on the real thread proves
both responses return within 2 s, after a commit. A newer code survives a failed mail. Three mutants
fail as expected: send before commit, always inline, and no timeout.
