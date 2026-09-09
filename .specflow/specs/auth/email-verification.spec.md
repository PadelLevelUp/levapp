---
id: auth.email-verification
status: draft
depends_on: [auth.register, auth.login, settings.profile]
implements: ../../specs-business/auth/newcomer-signs-up-on-their-own.business.md
governed_by: [R-022, R-024]
---

# auth.email-verification

### Intent
Prove that the email a person typed at self-signup is theirs, with a 6-digit code sent to that
address and typed back on the phone — not a link, because the person is already signed in on the
device they registered from and a link would bounce them to a browser. Until PAD-234 a
self-service account was created with an unverified email, so a typo silently broke every future
mail (approval, recovery, notifications). The same step re-runs whenever a person changes their
own email in Settings.

### Entities
- **WRITES:** User — new columns `email_verification_required` (bool, server default false),
  `email_verified_at` (datetime, nullable), `email_verification_code_hash` (string, nullable),
  `email_verification_expires_at` (datetime, nullable), `email_verification_sent_at` (datetime,
  nullable), `email_verification_attempts` (int, server default 0). The migration marks every
  existing user that has an email as verified (`email_verified_at = now`): they were onboarded by
  hand before verification existed, exactly as `auth.coach-approval` backfilled coaches.
- **READS:** User

### Rules
1. **Who must verify.** `email_verification_required` is set to true only by self-signup
   (`auth.register`) and by a self-service email change (`settings.profile` rule 9). An email a
   coach types for a player (`players.create`, `auth.activate`) never triggers the step, so a
   coach-created player is not stopped on first sign-in. When the config flag
   `EMAIL_VERIFICATION_REQUIRED` is off (default on), neither path sets the flag and the user
   is treated as verified at once. Every deployed environment keeps it on; the switch exists
   for a box with no sender at all.
2. **State on `/api/auth/me`.** `emailVerification` is `"verified"` when `email_verified_at`
   is set, `"pending"` when the user has an email, is required to verify and has not, and
   `"unverified"` otherwise (has an email nobody asked them to verify, or no email at all).
   `POST /api/auth/register` returns the same field inside `user`.
3. **The code.** 6 digits, generated with a CSPRNG, stored only as an HMAC-SHA256 hash keyed by
   `SECRET_KEY`. Valid for 15 minutes. At most 5 wrong attempts per code; the 5th wrong attempt
   invalidates the code and the person must request a new one. Requesting a new code replaces the
   old one (old code stops working) and resets the attempt counter.
4. `POST /api/auth/email-verification/send` (JWT, any role) issues a code for the user's current
   email and sends it. 200 `{"email": "<the address>", "expiresInSeconds": 900,
   "resendAvailableInSeconds": 60}`. 400 `{"error": "NO_EMAIL"}` when the user has no email.
   409 `{"error": "ALREADY_VERIFIED"}` when `emailVerification` is already `"verified"`. 429
   `{"error": "RESEND_TOO_SOON", "retryAfterSeconds": n}` when a code was sent less than 60
   seconds ago. A mail-transport failure is 503 `{"error": "MAIL_FAILED"}` and leaves no code
   stored, so the client can offer retry; it is never a 500.
5. `POST /api/auth/email-verification/confirm` `{"code": "123456"}` (JWT). On a match: sets
   `email_verified_at`, clears the code, hash, expiry and attempts, and returns 200 with the
   `/api/auth/me` payload (so the client re-routes without a second request). A wrong code is
   400 `{"error": "INVALID_CODE", "attemptsLeft": n}`. An expired, exhausted or never-issued code
   is 410 `{"error": "CODE_EXPIRED"}` — the client offers "Send a new code". Whitespace around the
   code is ignored; anything that is not exactly 6 digits is `INVALID_CODE` without consuming an
   attempt.
6. **Signup sends the first code.** `auth.register` (rule 14) issues and sends the code inside
   the signup request, best-effort: a transport failure is logged, the account is still created,
   and the verify screen's "Send a new code" is the recovery. Nothing about the code is returned
   by the register response.
7. **The email.** Subject `O teu código LevApp: 123456` / `Your LevApp code: 123456`, in the
   user's `language`. Branded HTML (LevApp mark, the code in large tabular digits, "valid for 15
   minutes", "if this wasn't you, ignore this email") plus a plain-text alternative. pt-PT, *tu*,
   no emoji. The sender is the configured `MAIL_USERNAME`; the mail is rendered by
   `padel_app/tools/email_templates.py`, the same module that renders the coach-approval mail
   (`auth.coach-approval` rule 5). Every image and link in the mail is an absolute URL rooted at
   `PUBLIC_WEB_ORIGIN`, and every deployed environment sets that variable to its **own** origin
   in `backend/.env.<env>` (`https://staging.levapp.app` on staging, `https://levapp.app` on
   prod) so staging mail can be checked against staging's assets; the `https://levapp.app`
   default in the module is only for a box that sets nothing. A missing brand asset is a 404
   from the web app, never the SPA shell (`auth.mobile-universal-links` notes).
8. **Client routing (web and iOS, R-024).** Right after signup, and on every app load, a user
   whose `emailVerification` is `"pending"` is held on the **Verify your email** screen before
   the pending-approval / club-onboarding / connect-with-a-coach / dashboard routing of
   `auth.register` rule 11. The screen shows the address the code went to, six large code cells
   with a numeric keyboard and one-time-code autofill (`autocomplete="one-time-code"` on web,
   `textContentType="oneTimeCode"` on iOS), submits automatically when the sixth digit lands,
   accepts a pasted 6-digit code, shows the wrong-code message with the attempts left under the
   cells, and offers **Send a new code** (disabled with a 60-second countdown after each send),
   **Change email** (edits the address inline, PATCHes `/api/auth/me`, which issues a fresh code
   to the new address) and **Sign out**. A user whose state is `"unverified"` is never held here.
   - 8a. **Just registered means a code is in flight.** The screen never requests a code on
     mount for a `"pending"` user — signup (rule 6) and a Settings email change
     (`settings.profile` rule 9) already sent one — and its countdown starts from
     `emailVerificationResendInSeconds`. Only an `"unverified"` user (Settings → Verify) gets a
     code requested on mount. A 429 `RESEND_TOO_SOON` from **Send a new code** is never
     presented as a failure: the button takes `retryAfterSeconds` as its countdown and the
     hint under the cells stays neutral; no error text is shown.
   - 8b. **Paste on iOS.** The real input is an invisible overlay (so the keypad and autofill
     land in it), which leaves iOS with nothing to anchor its Paste callout to. A **Paste
     code** button under the cells reads the clipboard, keeps the first run of 6 digits and
     submits it; a clipboard with no such run shows a neutral "no code in the clipboard" hint.
     Web has no button: its real input already accepts ⌘V/Ctrl+V, and browser clipboard-read
     either prompts (Chrome) or is unsupported (Firefox), so the exception to R-024 is
     deliberate. Nothing in the mail itself can copy — mail clients run no script — so the
     mail keeps the code as one selectable token (letter-spacing, never inserted spaces).
9. **Settings.** The profile section (web and iOS) shows the email's state next to the field:
   *Verified* (success tone) or *Not verified* with a **Verify** action that opens the same code
   screen (as a route on web, a modal on iOS). Saving a new email address shows the code screen
   immediately after the save succeeds (`settings.profile` rule 9).
10. **Admin.** `GET /api/app/admin/coach-approvals` rows gain `emailVerified: bool`, and the
    Settings → Admin list (web and iOS) marks an unverified email so the admin does not approve a
    coach nobody can reach. The "coach waiting" admin email (`auth.coach-approval` rule 4) says
    whether the email is verified.
11. **Test transport.** When `E2E_DEBUG_ENDPOINTS` is on (the flag the Playwright config and the
    Maestro runner already set, never the deploy workflows), `email_tools.send_email` records every
    message in an in-process outbox instead of using SMTP, and
    `GET /api/auth/email-verification/debug/last-code` (404 without the flag) returns the 6-digit
    code from the latest outbox message addressed to the caller's own email (JWT), or to
    `?email=` — the Maestro runner holds no token, and the outbox exists only on the flag-gated
    test backend. This is how the E2E suites read the code. `/api/auth/me` also carries
    `emailVerificationResendInSeconds` so the countdown survives a reload.
12. **Recipient guard.** `MAIL_ALLOWED_RECIPIENTS` (comma-separated exact addresses and `@domain`
    suffixes, case-insensitive) is enforced inside `email_tools.send_email` for every message the
    app sends: recipients outside the list are dropped and logged, and a message with nobody left
    raises like a transport failure (so `send` answers 503 `MAIL_FAILED`, never a silent success).
    Empty means everyone (prod). Staging runs with a real sender and `@levapp.app` only, because
    its database is a copy of prod's and it must never mail a real coach.

### Acceptance Criteria

#### Signup issues a code and reports pending
- **Given** no user `ana` and a captured mail transport
- **When** POST `/api/auth/register` with role `student`, email `ana@example.com`
- **Then** the response is 201 and `user.emailVerification` is `"pending"`
- **And** exactly one mail was sent to `ana@example.com` whose text body contains a 6-digit code
- **And** the stored `email_verification_code_hash` is not the code itself

#### Correct code verifies and routes
- **Given** `ana` pending with a code issued at 10:00
- **When** at 10:05 she POSTs `/api/auth/email-verification/confirm` with that code
- **Then** the response is 200 with `emailVerification: "verified"`, `email_verified_at` is set and the hash, expiry and attempts are cleared
- **And** a second POST with the same code is 410 `CODE_EXPIRED`

#### Wrong code counts attempts and locks on the fifth
- **Given** `ana` pending with a valid code
- **When** she POSTs `confirm` with a wrong code four times
- **Then** each response is 400 `INVALID_CODE` with `attemptsLeft` 4, 3, 2, 1
- **When** she POSTs a wrong code a fifth time
- **Then** the response is 400 with `attemptsLeft: 0`, and the *correct* code is now 410 `CODE_EXPIRED`

#### Expired code
- **Given** `ana` pending with a code issued at 10:00
- **When** at 10:16 she POSTs `confirm` with the correct code
- **Then** the response is 410 `CODE_EXPIRED` and she is still `"pending"`

#### Resend is rate-limited and replaces the code
- **Given** `ana` pending, code A sent at 10:00:00
- **When** she POSTs `send` at 10:00:30
- **Then** the response is 429 `RESEND_TOO_SOON` with `retryAfterSeconds: 30`
- **When** she POSTs `send` at 10:01:00
- **Then** the response is 200, a second mail is sent, code A is 410 and the new code B verifies

#### Malformed code does not consume an attempt
- **Given** `ana` pending with a valid code and 5 attempts left
- **When** she POSTs `confirm` with `"12 34"` and then with `"abcdef"`
- **Then** both are 400 `INVALID_CODE` with `attemptsLeft: 5`
- **And** POSTing ` 123456 ` (the right code with spaces) verifies

#### Already verified and no email
- **Given** `ana` verified
- **When** she POSTs `send`
- **Then** the response is 409 `ALREADY_VERIFIED`
- **Given** a user with no email
- **When** they POST `send`
- **Then** the response is 400 `NO_EMAIL`

#### Mail failure at signup does not fail the signup
- **Given** `send_email` raises
- **When** POST `/api/auth/register`
- **Then** the response is still 201 and the user is `"pending"` with no code stored
- **When** the user POSTs `send` while the transport still raises
- **Then** the response is 503 `MAIL_FAILED`

#### Coach-created players are not stopped
- **Given** a coach creates a player with email `bruno@example.com` and Bruno activates the account
- **When** Bruno GETs `/api/auth/me`
- **Then** `emailVerification` is `"unverified"` and no verify screen is shown on web or iOS

#### Existing users are grandfathered by the migration
- **Given** two users with an email and one without, all created before the migration
- **When** the migration runs
- **Then** the two with an email have `email_verified_at` set and the third has it null

#### Staging cannot mail anyone outside the allowlist
- **Given** `MAIL_ALLOWED_RECIPIENTS` is `@levapp.app, tester@gmail.com` and a real sender
- **When** the app sends to `Ana@LevApp.app`, `tester@gmail.com` and `coach@clubreal.pt`
- **Then** the message goes to the first two only and the third is logged as dropped
- **When** the only recipient is `coach@clubreal.pt`, or `ana@levapp.app.evil.com`
- **Then** nothing is sent and the caller sees a failure; a signup to such an address is still created and its `send` answers 503
- **And** with the setting empty the same message goes to everyone

#### Gate switched off
- **Given** `EMAIL_VERIFICATION_REQUIRED` is off
- **When** POST `/api/auth/register`
- **Then** the response is 201 with `user.emailVerification: "verified"` and no mail is sent

#### Changing the email re-verifies
- **Given** `ana` verified with `ana@example.com`
- **When** she PATCHes `/api/auth/me` with `{"email": "ana.silva@example.com"}`
- **Then** the response shows `emailVerification: "pending"`, a code was mailed to the new address, and her next `GET /api/auth/me` still says `"pending"`
- **And** PATCHing the same address she already has changes nothing

#### The verify screen holds the newcomer on web
- **Given** a visitor on the web `/signup` page with `E2E_DEBUG_ENDPOINTS` on
- **When** they create a student account
- **Then** the **Verify your email** screen is shown with `ana@example.com` and six code cells, and the dashboard routes are not reachable
- **When** they type a wrong code
- **Then** the wrong-code message shows "4 attempts left" under the cells
- **When** they type the code read from the debug route
- **Then** they land on the "Connect with a coach" screen
- **And** reloading the app does not show the verify screen again

#### Send a new code countdown on web
- **Given** the verify screen just after signup
- **Then** **Send a new code** is disabled and counts down from 60
- **When** the countdown ends and the user clicks it
- **Then** the debug route returns a different code, the button is disabled again and the old code no longer verifies

#### Just registered means a code is in flight
- **Given** a visitor who just created an account on web or iOS
- **When** the verify screen appears
- **Then** no `POST /api/auth/email-verification/send` leaves the client, and **Send a new code** is disabled and counting down

#### A too-soon resend is not an error
- **Given** the verify screen with **Send a new code** enabled
- **When** the user clicks it and the server answers 429 `RESEND_TOO_SOON` with `retryAfterSeconds: 42`
- **Then** the button is disabled and reads a countdown from 42, and no error text is shown under the cells

#### Same flow on iOS
- **Given** the iOS app after a self-signup
- **Then** the same verify screen is shown, with the numeric keypad and the one-time-code autofill hint, and it accepts a pasted code

#### Paste on iOS
- **Given** the iOS verify screen and `166315` (the current code) on the clipboard
- **When** the user taps **Paste code**
- **Then** the six cells fill with `166315` and the code is submitted
- **Given** the clipboard holds `see you at 10` instead
- **When** the user taps **Paste code**
- **Then** the cells stay empty and the hint says there is no code in the clipboard

#### The mail points at the environment that sent it
- **Given** `PUBLIC_WEB_ORIGIN` is `https://staging.levapp.app`
- **When** the verification mail is rendered
- **Then** its lockup `<img src>` and every link start with `https://staging.levapp.app`
- **And** `backend/.env.staging` sets `PUBLIC_WEB_ORIGIN=https://staging.levapp.app` and `backend/.env.prod` sets `PUBLIC_WEB_ORIGIN=https://levapp.app`

#### Settings shows the state
- **Given** a verified user on Settings → Profile (web and iOS)
- **Then** *Verified* is shown next to the email
- **When** they save a different email
- **Then** the code screen opens for the new address, and after verifying, Settings shows *Verified* again

#### Admin sees the verification state
- **Given** pending coach `rui` who has not verified
- **When** the admin GETs `/api/app/admin/coach-approvals`
- **Then** `rui`'s row has `emailVerified: false`, and the Admin list marks it on web and iOS

### Notes
- Linear: PAD-234 (this), PAD-231 (mail sender: prod already has `MAIL_USERNAME` +
  `MAIL_PASSWORD`; only `ADMIN_NOTIFY_EMAIL` was missing), PAD-187 (move the sender to
  `admin@levapp.app` once its app password exists).
- Decision: a code, not a link — the person is on the phone they signed up from; a link opens a
  browser and loses the session. Decision: the server does not block any other endpoint on
  verification in v1 — the clients hold the person on the screen, and the two things that will
  truly depend on a verified email (password recovery PAD-139, notification email) will check
  `email_verified_at` when built.
- OPEN: no rate limit on `send` beyond the per-user 60-second cooldown (shares PAD-228's gap).
- PAD-250 / B-031: the ticket's "client double-sends after register" did not reproduce from
  source — both shells already skip the mount-time send for a `pending` user. Rule 8a pins
  that and the 429 presentation. PAD-251 / B-032, B-033: origin per environment, honest 404 for
  `/brand/*`, and the iOS Paste button. Decision: no deep link carrying the code in the mail —
  codes in URLs get logged, forwarded and cached.
- OPEN: coach-created players keep an unverified email forever unless they change it; a
  "Verify" action in Settings covers the ones who care.
