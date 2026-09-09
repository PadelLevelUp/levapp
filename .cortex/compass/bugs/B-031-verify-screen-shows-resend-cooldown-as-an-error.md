---
id: B-031
title: "The verify-email screen presents RESEND_TOO_SOON as an error on web and iOS"
type: incomplete-rule
severity: medium
status: triaged
affects:
  - auth.email-verification
  - frontend/apps/web/src/pages/VerifyEmailPage.tsx
  - frontend/apps/mobile/app/verify-email.tsx
proposed_fix: "Rule 8 gains 8a: a 429 on Send a new code is not a failure — the button takes retryAfterSeconds as its countdown and no error text is shown; the screen never requests a code on mount for a pending user."
opened: 2026-09-09T00:00:00Z
---

# B-031 — The verify-email screen presents RESEND_TOO_SOON as an error on web and iOS

**Source:** Linear PAD-250 (staging diagnosis, 2026-09-09). The ticket reproduced
`POST /api/auth/register → 201` followed by `POST /api/auth/email-verification/send → 429
{"error":"RESEND_TOO_SOON","retryAfterSeconds":57}` on two fresh accounts, and asked which
side owns the first send and how the screen should present the 429.

**What happens:** whenever `send` answers 429, both shells set the countdown *and* print
`auth.verifyEmail.tooSoon` in the error slot under the cells (red text). The first thing a
newcomer can read on their first screen is a failure, while a valid code is already in the
inbox.

**What should happen:** a 429 is the server saying "already sent"; the screen shows the
disabled, counting-down **Send a new code** button (from `retryAfterSeconds`) and nothing in
red.

**Root cause:** Type 2 — incomplete rule. `auth.email-verification` rule 8 says the button is
"disabled with a 60-second countdown after each send" and rule 4 defines the 429, but no rule
says what the *screen* does with a 429, so both shells treated it like every other failure.

**Evidence (Phase 1):**
1. `frontend/apps/web/src/pages/VerifyEmailPage.tsx` `send()` catch: on 429 it calls
   `setCountdown(retryAfterSeconds)` **and** `setError(t("auth.verifyEmail.tooSoon"))`;
   `frontend/apps/mobile/app/verify-email.tsx` `send()` is the same shape.
2. The ticket's premise that the client itself issues the post-register `send` did **not**
   reproduce from source: both shells route to the code screen and their mount effect only
   requests a code when `emailVerification !== "pending"` (the Settings → Verify path). The
   TestFlight build the report came from (`chore/mobile-build-14-staging`, e00714f) already
   carries that guard. The double POST in the ticket was made by hand; registration owns the
   first send (rules 4 and 6) and the clients already honour it. Nothing to change there — the
   rule is made explicit so nobody re-adds a mount-time send.
3. `backend/padel_app/tests/test_email_verification.py::test_send_route_is_429_right_after_signup`
   passes: the cooldown is doing its job.

**Affected specs:**
- Dev: `.specflow/specs/auth/email-verification.spec.md` — rule 8 gains 8a and two criteria.
- Business: `.specflow/specs-business/auth/newcomer-signs-up-on-their-own.business.md` —
  unchanged (journey step 3 already says "a new code requested after a minute").

### Change Plan

**Spec to modify:** `.specflow/specs/auth/email-verification.spec.md`
**Change type:** add rule 8a + criteria

1. Rule 8a: the screen never requests a code on mount for a `pending` user — signup and a
   Settings email change already sent one; the countdown starts from
   `emailVerificationResendInSeconds`. Only an `unverified` user (Settings → Verify) gets a
   code requested on mount. A 429 from **Send a new code** is never shown as an error: the
   button takes `retryAfterSeconds` as its countdown and the hint under the cells stays neutral.
2. Criteria: "Just registered means a code is in flight" (no `send` request leaves the client
   after signup; the button counts down) and "A too-soon resend is not an error" (a 429 with
   `retryAfterSeconds: 42` disables the button for 42 s and shows no error text).
3. Tests: Playwright `auth-onboarding/email-verification.spec.ts` (network assertion + a
   routed 429); iOS mirrors the web change, verified in the simulator.
4. Code: drop `setError` from the 429 branch in both shells; leave the hint alone.

### Resolution

_pending_
