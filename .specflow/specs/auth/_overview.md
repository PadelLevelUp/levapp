# auth — Authentication & User Management

## What this is

The auth domain.

## What it covers

- `auth.login` — implemented
- `auth.logout` — implemented
- `auth.register` — implemented
- `auth.activate` — implemented
- `auth.token-refresh` — implemented
- `auth.push-subscription` — implemented
- `auth.mobile-universal-links` — implemented

## Why it's grouped this way

One domain of the LevelUp product, migrated 2026-09-03 from the legacy `specs/auth/spec.md` (one file per domain) into one leaf per behaviour. Leaves sit directly under the domain — no capability folders yet.
