# players — Player Management

## What this is

The players domain.

## What it covers

- `players.invite-completion` — implementing (rule 9, the "sign in to link" path, is draft)
- `players.create` — implemented
- `players.duplicate-name-check` — implemented
- `players.edit` — implemented
- `players.list` — implemented
- `players.profile` — implemented
- `players.remove` — implemented
- `players.add-existing` — draft, **deprecated** in substance (superseded 2026-09-06 by join-token + claim; not in the build order)
- `players.join-token` — implemented (coach's reusable QR/link; a signed-in student redeems it; PAD-212)
- `players.claim` — draft (merge a coach-created placeholder into a student's real account)
- `players.notes` — implemented
- `players.level-history` — implemented

## Why it's grouped this way

One domain of the LevelUp product, migrated 2026-09-03 from the legacy `specs/players/spec.md` (one file per domain) into one leaf per behaviour. Leaves sit directly under the domain — no capability folders yet.
