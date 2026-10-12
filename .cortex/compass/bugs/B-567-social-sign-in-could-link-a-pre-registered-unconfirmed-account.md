---
id: B-567
title: "Google/Apple sign-in linked to any active account with the same email, even one whose own email was never confirmed — a pre-registration takeover"
type: incomplete-rule
severity: critical
status: resolved
resolved: 2026-10-11T16:40:00Z
affects:
  - .specflow/specs/auth/social-sign-in.spec.md
  - backend/padel_app/services/social_auth_service.py
proposed_fix: "Rule 2b: link only when the LevApp account's email is verified (email_verified_at set); otherwise 409 ACCOUNT_EMAIL_UNVERIFIED."
opened: 2026-10-11T16:30:00Z
---

# B-567: social sign-in could link a pre-registered, unconfirmed account

> Ledger id **unconfirmed** (wave-14 range B-561–580; B-566 is on the PAD-604 branch). Caught in
> review before the code ever left the branch: it never reached staging or production.

**Source:** the PAD-618 security review (sonnet), 2026-10-11, before the first push.

**What happened:** `resolve` (auth.social-sign-in rule 2b) linked a verified Google or Apple
identity to any active LevApp account with the same email and signed the visitor in. It checked that
the PROVIDER verified the address, but not that the LevApp account had. Scenario: an attacker signs
up by password with `victim@gmail.com` and never confirms it; when the victim later taps "Continuar
com Google", they land in the attacker's account, whose password the attacker still knows (and
whose sessions stay open).

**What should happen:** link only when the account's own email is verified (`email_verified_at`
set); otherwise 409 `ACCOUNT_EMAIL_UNVERIFIED`, and the person signs in with the password and
confirms the email first.

**Evidence (Phase 1):** `test_an_account_whose_own_email_is_unverified_is_never_linked` was red on
the first implementation (200, identity written) and is green on the fix (409, nothing written). A
mutant that drops the check (`if False:` in place of `if user.email_verified_at is None:`) turns it
red again (200 vs 409), so the test guards the line. Rule 2b said "the provider verified the email"
and nothing about the local account: Type 2, incomplete rule.

### Change Plan
- Rule 2b and a criterion (done).
- `resolve`: the local-verification check, the identity looked up first (a returning Apple user has
  no email), the oldest account when legacy rows share an address up to case.

### Resolution
- Fixed in the same branch before any push (PAD-618, feature/pad-618). Same review round: a racing
  second completion is 409 not 500; Apple tokens require exp/iat/sub with a 5 s JWKS timeout and an
  outage is 503; usernames come from the first name, never the email.
