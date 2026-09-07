# auth — Authentication & User Management

## What this is

The auth domain.

## What it covers

- `auth.login` — implemented
- `auth.logout` — implemented
- `auth.register` — implemented (rewritten 2026-09-06 as self-service signup for both roles; the old `POST /api/auth/register` never existed, B-023; built in PAD-210)
- `auth.activate` — implemented
- `auth.coach-approval` — implemented (LevApp admin approves self-registered coaches; gate is switchable; PAD-210)
- `auth.token-refresh` — implemented
- `auth.push-subscription` — implemented
- `auth.mobile-universal-links` — implemented
- `auth.mobile-account-creation` — implemented

## Why it's grouped this way

One domain of the LevelUp product, migrated 2026-09-03 from the legacy `specs/auth/spec.md` (one file per domain) into one leaf per behaviour. Leaves sit directly under the domain — no capability folders yet.
