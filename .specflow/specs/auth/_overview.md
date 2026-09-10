# auth — Authentication & User Management

## What this is

The auth domain.

## What it covers

- `auth.login` — implemented
- `auth.logout` — implemented
- `auth.register` — implemented (rewritten 2026-09-06 as self-service signup for both roles; the old `POST /api/auth/register` never existed, B-023; built in PAD-210)
- `auth.activate` — implemented
- `auth.coach-approval` — implemented (LevApp admin approves self-registered coaches; gate is switchable; PAD-210)
- `auth.email-verification` — draft (6-digit code mailed at self-signup and on a self-service email change; clients hold the person on the code screen; PAD-234)
- `auth.password-recovery` — draft (email-based password and username recovery: one mail with the username and a single-use 6-digit code; replaces the dead legacy `/auth/forgot_password`; PAD-139)
- `auth.token-refresh` — implemented
- `auth.push-subscription` — implemented
- `auth.landing-page` — implemented (web-only public page at `/`, audience tabs)
- `auth.mobile-universal-links` — implemented
- `auth.mobile-account-creation` — implemented
- `auth.account-deletion` — implementing (PAD-268: deleting an account removes it from the future, keeps the coach's records)

## Why it's grouped this way

One domain of the LevelUp product, migrated 2026-09-03 from the legacy `specs/auth/spec.md` (one file per domain) into one leaf per behaviour. Leaves sit directly under the domain — no capability folders yet.
