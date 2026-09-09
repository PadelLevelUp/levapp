---
id: auth.password-recovery
status: draft
depends_on: [auth.login, auth.email-verification]
implements: ../../specs-business/auth/newcomer-signs-up-on-their-own.business.md
governed_by: [R-022, R-024]
---

# auth.password-recovery

### Intent
A coach or student who forgot their password, their username, or both gets back into their
account on their own, from the login screen, on web and on iOS. They type the email on the
account; a 6-digit code and the username arrive in that inbox; the code plus a new password
signs them in. Until PAD-139 the only recovery path was a legacy server-rendered
`/auth/forgot_password` route whose mail template no longer existed, whose 5-digit code was
stored in clear with no expiry, and which no client linked to — a locked-out user had no way
back at all.

### Entities
- **WRITES:** User — new columns `password_reset_code_hash` (string, nullable),
  `password_reset_expires_at` (datetime, nullable), `password_reset_sent_at` (datetime,
  nullable), `password_reset_attempts` (int, server default 0); `password`; `email_verified_at`.
  The legacy `generated_code` column is no longer read or written by any route (it is still
  scrubbed on account deletion) and is dropped in a later cleanup migration.
- **READS:** User

### Rules
1. **One token model.** The recovery code replaces the legacy `generated_code` flow: the
   server-rendered `forgot_password`, `verify_generated_code` and `generate_new_code` routes and
   their templates are removed, so there is exactly one recovery mechanism in the app. The code
   follows `auth.email-verification` rule 3: 6 digits from a CSPRNG, stored only as an
   HMAC-SHA256 keyed by `SECRET_KEY`, valid for 15 minutes, dead after 5 wrong attempts,
   replaced by every new request, and **single-use**: a successful confirm clears it.
2. **Recovery is by email.** `POST /api/auth/password-recovery/request` `{"email": "…"}`
   (no JWT) looks the address up case-insensitively. Whether or not a user with that email
   exists, and whether or not a code was actually issued, the response is 200
   `{"ok": true, "expiresInSeconds": 900, "resendAvailableInSeconds": 60}` — the response
   never reveals whether the email belongs to an account. A syntactically invalid email is the
   only 400 (`{"error": "INVALID_EMAIL"}`), because that reveals nothing.
3. **What gets sent.** When the email belongs to a user, one mail goes to that address carrying
   the username **and** the code, so a person who forgot their username gets it from the same
   flow with no separate "forgot username" endpoint. Subject
   `Recuperar o acesso à tua conta LevApp` / `Recover access to your LevApp account`, in the
   user's `language`. Branded HTML plus a plain-text alternative, rendered by
   `padel_app/tools/email_templates.py`; pt-PT, *tu*, no emoji; "valid for 15 minutes",
   "if this wasn't you, ignore this email — your password has not changed". It is sent through
   `email_tools.send_email`, so the outbox capture (`auth.email-verification` rule 11) and the
   recipient allowlist (rule 12) apply unchanged. A transport failure is logged and still
   answers 200 (rule 2); the stored code is cleared so it cannot be guessed.
4. **Per-email cooldown.** A second request for the same email less than 60 seconds after a
   mail was sent issues nothing and sends nothing, but still answers 200 with the same body.
   The client shows the countdown from `resendAvailableInSeconds` on its own clock. A
   per-IP throttle is PAD-228's job and layers on top.
5. **Who can recover.** Any user with an email and a password, whatever their
   `emailVerification` state — the address on the account is the only one there is, and
   receiving the code proves possession of it exactly as the verification code does. A user
   with no email (some coach-created players) cannot recover on their own; their coach resets
   the password (`players.*`). A `disabled` user gets no mail.
6. `POST /api/auth/password-recovery/confirm` `{"email": "…", "code": "123456",
   "newPassword": "…"}` (no JWT). Checks run in this order and the first failure answers:
   - `newPassword` shorter than 8 characters → 400 `{"error": "WEAK_PASSWORD"}` (the
     registration minimum, `auth.register`); never consumes an attempt.
   - `code` not exactly 6 digits after trimming → 400 `{"error": "INVALID_CODE",
     "attemptsLeft": n}`; never consumes an attempt.
   - unknown email, no code issued, expired, or exhausted → 410 `{"error": "CODE_EXPIRED"}` —
     the same answer for an email that has no account, so the confirm step leaks nothing
     either.
   - wrong code → 400 `{"error": "INVALID_CODE", "attemptsLeft": n}`; the 5th wrong attempt
     clears the code and the right one is 410 from then on.
   - match → the password is replaced (bcrypt, as `auth.register`), the code, expiry, sent-at
     and attempts are cleared, `email_verified_at` is set if it was null (the person just
     proved the address), and the response is 200 with the same body as `POST /api/auth/login`
     (`accessToken` + `user`), so the client signs the person in without a second round trip.
7. **Entry point on the login screen (web and iOS, R-024).** `auth.login` gains a
   **Forgot your password?** link under the sign-in button (`data-testid`
   `auth-forgot-password` on web, `testID` `login-forgot-password` on iOS) that opens the
   recovery flow: `/forgot-password` on web, the `forgot-password` screen on iOS. The copy on
   the recovery screen says the mail also carries the username, so "I forgot my username" is
   the same tap.
8. **The recovery screen (web and iOS).** Step 1: an email field and **Send code**; on submit
   it always moves to step 2 and says "If that email has an account, we sent a code" — never
   "no account with that email". Step 2, on the same route: the six code cells of
   `auth.email-verification` rule 8 (numeric keyboard, one-time-code autofill, paste), a
   **New password** field with the registration minimum, **Sign in**, **Send a new code**
   (disabled with a 60-second countdown after each send, then re-requests for the same email)
   and **Back to sign in**. A wrong code shows the attempts left under the cells; a 410 says the
   code is no longer valid and points at **Send a new code**; a `WEAK_PASSWORD` is shown under
   the password field. On success the client stores the token, refreshes `/me` and routes
   exactly as a fresh login does (`auth.register` rule 11 / `postLoginLanding`), with a
   "Password changed" toast.
9. **Test transport.** The E2E suites read the code with the existing
   `GET /api/auth/email-verification/debug/last-code?email=` route (`auth.email-verification`
   rule 11): the recovery mail's text body carries the same 6-digit shape, and the route is
   flag-gated and unauthenticated by design.

### Acceptance Criteria

#### Request issues a code and mails the username
- **Given** user `ana` with email `ana@example.com`, username `ana.silva`, `language` `pt` and a captured mail transport
- **When** POST `/api/auth/password-recovery/request` with `{"email": "Ana@Example.com"}`
- **Then** the response is 200 `{"ok": true, "expiresInSeconds": 900, "resendAvailableInSeconds": 60}`
- **And** exactly one mail was sent to `ana@example.com` whose subject is `Recuperar o acesso à tua conta LevApp` and whose text body contains `ana.silva` and a 6-digit code
- **And** the stored `password_reset_code_hash` is not the code and `password_reset_expires_at` is 15 minutes after `password_reset_sent_at`

#### Unknown email answers exactly like a known one
- **Given** no user with email `nobody@example.com`
- **When** POST `request` with that email
- **Then** the response is 200 with the same body as for a known email, and no mail is sent
- **When** POST `request` with `{"email": "not-an-email"}`
- **Then** the response is 400 `INVALID_EMAIL`

#### Confirm sets the password and signs in
- **Given** `ana` with a code issued at 10:00 and old password `OldPass123`
- **When** at 10:05 she POSTs `confirm` with the code and `newPassword` `NewPass456`
- **Then** the response is 200 with an `accessToken` and `user.id` equal to hers
- **And** `POST /api/auth/login` with `NewPass456` is 200 and with `OldPass123` is 401
- **And** the hash, expiry, sent-at and attempts are cleared, and `email_verified_at` is set

#### A code is single-use
- **Given** `ana` just confirmed with code A
- **When** she POSTs `confirm` again with code A and another password
- **Then** the response is 410 `CODE_EXPIRED` and the password is unchanged

#### Expired code
- **Given** `ana` with a code issued at 10:00
- **When** at 10:16 she POSTs `confirm` with the correct code
- **Then** the response is 410 `CODE_EXPIRED` and her password is unchanged

#### Wrong code counts attempts and locks on the fifth
- **Given** `ana` with a valid code
- **When** she POSTs `confirm` with a wrong code four times
- **Then** each response is 400 `INVALID_CODE` with `attemptsLeft` 4, 3, 2, 1
- **When** she POSTs a wrong code a fifth time
- **Then** the response is 400 with `attemptsLeft: 0`, and the *correct* code is now 410 `CODE_EXPIRED`

#### Confirm for an unknown email looks like an expired code
- **Given** no user with email `nobody@example.com`
- **When** POST `confirm` with that email, code `123456` and password `NewPass456`
- **Then** the response is 410 `CODE_EXPIRED`

#### Weak password and malformed code do not consume an attempt
- **Given** `ana` with a valid code and 5 attempts left
- **When** she POSTs `confirm` with the right code and `newPassword` `short`
- **Then** the response is 400 `WEAK_PASSWORD` and the code still has 5 attempts
- **When** she POSTs `confirm` with code `12 34` and `NewPass456`
- **Then** the response is 400 `INVALID_CODE` with `attemptsLeft: 5`
- **And** POSTing ` <the right code> ` with spaces around it and `NewPass456` is 200

#### Cooldown does not resend and does not leak
- **Given** `ana` requested a code at 10:00:00
- **When** she POSTs `request` at 10:00:30
- **Then** the response is 200 with the standard body and no second mail is sent, and the first code still confirms
- **When** she POSTs `request` at 10:01:00
- **Then** a second mail is sent, the first code is now a wrong code (400 `INVALID_CODE`) and the new one confirms

#### Mail failure still answers 200 and leaves no code
- **Given** `send_email` raises
- **When** `ana` POSTs `request`
- **Then** the response is 200 with the standard body and `password_reset_code_hash` is null

#### Users without an email or disabled get nothing
- **Given** a coach-created player with no email, and a `disabled` user with email `off@example.com`
- **When** POST `request` for `off@example.com`
- **Then** the response is 200 and no mail is sent

#### The legacy routes are gone
- **Given** the app
- **When** GET `/auth/forgot_password`
- **Then** the response is 404

#### Web: forgot password from the login screen
- **Given** a visitor on web `/auth` with `E2E_DEBUG_ENDPOINTS` on and the seeded coach `e2e-coach`
- **When** they click **Forgot your password?**
- **Then** they are on `/forgot-password` with an email field
- **When** they submit the seeded coach's email
- **Then** the code step is shown with the neutral "if that email has an account" copy and six code cells
- **When** they type a wrong code and a valid new password and submit
- **Then** the wrong-code message shows "4 attempts left"
- **When** they type the code read from the debug route and the new password
- **Then** they land where a fresh login lands (the dashboard) and the "Password changed" toast is shown
- **And** signing out and signing in with the new password works, and the old one is refused

#### Web: an unknown email shows the same code step
- **Given** a visitor on `/forgot-password`
- **When** they submit `nobody@example.com`
- **Then** the code step is shown with the same neutral copy and no error

#### iOS: same flow
- **Given** the iOS login screen
- **When** the user taps **Forgot your password?**, submits the seeded coach's email, types the code from the debug route and a new password
- **Then** they land on the dashboard, and the seeded password is restored by the flow so later flows still sign in

### Notes
- Linear: PAD-139. Decision: a mailed code, not a link, for the reason `auth.email-verification`
  records — the person is on the device they will use, and a link opens a browser and loses the
  app. Decision: username recovery is folded into the same mail rather than a separate
  "forgot username" endpoint; a separate endpoint would have had to answer "we sent it" for
  unknown addresses too and would have doubled the surface for PAD-228 to throttle.
- Decision: recovery does not require a verified email (rule 5). A pending self-signup who
  forgot their password would otherwise be locked out of the very screen that verifies them.
- Decision: the legacy routes are removed rather than retargeted — their mail template was
  already missing, nothing linked to them, and keeping two entry points is what the ticket asked
  not to do.
- OPEN: per-IP throttling of `request` and `confirm` — PAD-228.
- OPEN: revoking other sessions on password change (JWTs are 30-day and there is no per-user
  blocklist) — not in v1.
