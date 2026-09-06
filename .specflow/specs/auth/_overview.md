# auth — Authentication & User Management

## What this is

The auth domain.

## What it covers

- `auth.login` — implemented
- `auth.logout` — implemented
- `auth.register` — draft (rewritten 2026-09-06 as self-service signup for both roles; the old `POST /api/auth/register` never existed, B-019)
- `auth.activate` — implemented
- `auth.coach-approval` — draft (LevApp admin approves self-registered coaches; gate is switchable)
- `auth.token-refresh` — implemented
- `auth.push-subscription` — implemented
- `auth.mobile-universal-links` — implemented

## Why it's grouped this way

One domain of the LevelUp product, migrated 2026-09-03 from the legacy `specs/auth/spec.md` (one file per domain) into one leaf per behaviour. Leaves sit directly under the domain — no capability folders yet.
