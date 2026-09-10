# clubs — Club Management

## What this is

The clubs domain.

## What it covers

- `clubs.crud` — implemented
- `clubs.membership` — implemented
- `clubs.coach-invitation` — implemented
- `clubs.join-request` — implemented (an approved coach creates a club or asks to join one; a member approves; PAD-211)
- `clubs.courts` — a club's courts, managed in Settings → Club; a class may carry one and shows it (PAD-194 v1)

## Why it's grouped this way

One domain of the LevelUp product, migrated 2026-09-03 from the legacy `specs/clubs/spec.md` (one file per domain) into one leaf per behaviour. Leaves sit directly under the domain — no capability folders yet.
