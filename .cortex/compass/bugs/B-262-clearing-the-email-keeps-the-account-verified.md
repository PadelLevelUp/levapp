---
id: B-262
title: "Clearing the email in Settings left the account marked verified, with no email to reach it"
type: incomplete-rule
severity: medium
status: resolved
resolved: 2026-10-02T15:57:48Z
updated: 2026-10-02T15:57:48Z
affects:
  - settings.profile
  - auth.email-verification
  - backend/padel_app/services/user_service.py
  - backend/padel_app/services/email_verification_service.py
proposed_fix: "Clearing the email also clears email_verified_at, email_verification_required and any pending code, in the same commit, so the state reads unverified (settings.profile rule 9)."
opened: 2026-10-02T15:23:18Z
---

# B-262: an account with no email reads as verified

**Source:** PAD-482 survey (2026-10-02), while asking which coaches can be left with no email.

**What happens:** `PATCH /api/auth/me` with an empty `email` sets `user.email = None`
(`user_service.py:240`) and leaves `email_verified_at` as it was. `verification_state`
(`email_verification_service.py:47`) answers `verified` whenever `email_verified_at` is set, so a coach
who removed their only address reads as **verified** in `/auth/me` and in the admin approvals list
(`emailVerified`). The Settings label is shown only when there is an email, so nothing anywhere says the
account can no longer recover its password or receive any mail.

**Evidence:** code read 2026-10-02 at origin/staging 193430632 (the two lines above); the spec says the
same on purpose: `settings.profile` (`profile.spec.md:51`) "Saving the same address, or clearing it, does
not touch the verification state". Prod: 0 coaches with no email (B-241's query, 2026-10-02), so no
account is in this state today.

**Root cause (diagnostic tree):** `settings.profile` rule 9 treats clearing like re-saving the same
address; `auth.email-verification` rule 2 derives the state from `email_verified_at` alone. Neither says
what the state of an account with no email is. Type 2, incomplete rule.

### Change Plan
- Spec: `settings.profile` rule 9 — clearing the email resets verification (unverified, nothing
  pending); `auth.email-verification` rule 2 — with no email the state is `unverified`.
- Code: `update_user_profile` clears `email_verified_at`, `email_verification_required` and the pending
  code fields when the email is cleared. Red first, the admin approvals list included.

### Resolution (PAD-482)

- **Spec:** `settings.profile` rule 9 — clearing the email (`""`, whitespace or `null`) clears its
  verification; a save that omits `email`, or re-sends the same address in any case, does not.
  `auth.email-verification` rule 2 — with no email the state is `unverified`; rule 10 — the admin
  list's `emailVerified` is that state.
- **Code:** `email_verification_service.forget_verification` (no timestamp, nothing required, no
  pending code), called by `update_user_profile` when the email is cleared; `verification_state`
  answers `unverified` first when there is no email, so a row cleared before the fix reads right
  without a data change; `coach_approval_service` derives `emailVerified` (and the admin mail's
  "verified") from that state.
- **Tests:** `test_pad482_clearing_the_email.py` — the three empty shapes, a pending code dropped, a
  PATCH without `email`, an old build's whole-form save with the same address, adding one back, and
  a stale row; red first, the admin approvals list included.
