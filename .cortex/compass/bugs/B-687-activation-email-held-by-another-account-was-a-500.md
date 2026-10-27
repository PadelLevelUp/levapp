---
id: B-687
title: "Activation wrote an email another account already held, so the UPDATE hit users_email_key and the student got a 500 instead of a 409 saying what to do"
type: incomplete-rule
severity: medium
status: resolved
affects:
  - backend/padel_app/services/user_service.py
  - frontend/apps/web/src/pages/RegisterPage.tsx
  - frontend/apps/mobile/src/features/auth/RegisterScreen.tsx
proposed_fix: "Check the email against other accounts (trimmed, any case) before any write and answer sign-up's 409 on email with code EMAIL_TAKEN; both activation screens put auth.register.emailHasAccount on the email field."
opened: 2026-10-27T11:00:00Z
resolved: 2026-10-27T11:00:00Z
---

# B-687: activation email held by another account was a 500

**Source:** prod container log, 2026-10-27 10:10:40Z, `POST /api/app/activate/user/<id>` 500 with
`IntegrityError ... violates unique constraint "users_email_key"` (read by SessionH, read-only).
Linear PAD-761.

**What happens:** a student activating a coach-created account types (or keeps) an email that
another account already holds, usually the account they made themselves. The one `UPDATE users`
fails on `users_email_key` and the route answers 500. The screens show the generic "try again".

**What should happen:** a 409 on `email` before anything is written, and a message telling the
student to sign in to the account they have and ask the coach to link it to the invitation.

**Root cause:** `auth.activate` rule 11 checked a taken username (409) but stated nothing for a
taken email, and `activate_user_service` had no check, though `users.email` is unique. Sign-up
has the check (`assert_email_free`, any case). The failed request rolled back whole: status
stayed `inactive`, nothing was written. In the prod case the coach linked the two accounts
(`players.claim`) 3.5 minutes later.

**Fix:** rule 11a; the check in `activate_user_service`; both screens map the 409.
Test: `backend/padel_app/tests/test_pad761_activation_email_taken.py`.
