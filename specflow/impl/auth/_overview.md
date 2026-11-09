# auth — Authentication & User Management

## What this is

The auth domain.

## What it covers

- `auth.login` — implemented
- `auth.legal-catch-up` — implementing (PAD-637: one skippable screen after login asks an older account for the Terms and/or a birth date)
- `auth.logout` — implemented
- `auth.register` — implemented (rewritten 2026-09-06 as self-service signup for both roles; the old `POST /api/auth/register` never existed, B-023; built in PAD-210)
- `auth.activate` — implemented
- `auth.coach-approval` — implemented (LevApp admin approves self-registered coaches; gate is switchable; PAD-210)
- `auth.coach-crm-sync` — implemented (a self-registered coach becomes a HubSpot contact; status follows the admin's decisions; coach data only; PAD-471)
- `auth.email-verification` — draft (6-digit code mailed at self-signup and on a self-service email change; clients hold the person on the code screen; PAD-234)
- `auth.password-recovery` — draft (email-based password and username recovery: one mail with the username and a single-use 6-digit code; replaces the dead legacy `/auth/forgot_password`; PAD-139)
- `auth.parental-consent` — **retired (PAD-457)**: the guardian-consent flow for minors, removed from the code when LevApp became adults-only (`auth.register` rule 18, `auth.activate` rule 13). Kept as the record; PAD-644 dropped its tables and the status column.
- `auth.token-refresh` — implemented
- `auth.social-sign-in` — draft (PAD-618: sign up and sign in with Google on web and iOS, and with Apple on iOS; one verified-token endpoint, linking by verified email, sign-up's own checks for new accounts; ships dark until the client ids exist)
- `auth.push-subscription` — implemented
- `auth.landing-page` — implemented (web-only public page at `/`, audience tabs)
- `auth.mobile-universal-links` — implemented
- `auth.mobile-account-creation` — implemented
- `auth.account-deletion` — implemented (PAD-268: deleting an account removes it from the future, keeps the coach's records)
- `auth.account-profiles` — implemented (PAD-260: an account has at most one player and one coach profile; a profile never outlives its account)

## Why it's grouped this way

One domain of the LevelUp product, migrated 2026-09-03 from the legacy `specs/auth/spec.md` (one file per domain) into one leaf per behaviour. Leaves sit directly under the domain — no capability folders yet.
- `legal-pages` — the public Terms of Service and Privacy Policy at /terms and /privacy, rendered from markdown with a version header and an EN | PT switch (PAD-601).
- `delete-account-page` — the public /delete-account page Google Play requires: how to delete in the app or by email without it, and what deletion removes and keeps (PAD-603, web only by design).
