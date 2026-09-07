# players

## What this is

Business outcomes for the players domain: how a coach builds, browses, and maintains their student
roster.

## What it covers

- `players.coach-builds-roster` — adding new students: manually (with or without a login), via invite
  link, via a QR/link the student redeems, or by linking a coach-created record to the student's
  own account; with duplicate-name protection.
- `players.coach-browses-and-reviews-roster` — searching the roster and reviewing a student's profile,
  notes, and level history.
- `players.coach-edits-player-details` — updating a student's details and removing them from the
  roster.

## Why it's grouped this way

Split by moment in the roster lifecycle rather than by entity: "getting someone onto the roster"
(create, duplicate check, invite-completion, and the not-yet-built add-existing path) is a different
journey from "keeping tabs on who's on it" (list, profile, notes, level-history), which is different
again from "keeping their details current or letting them go" (edit, remove). All three outcomes are
coach-only — the persona doing the acting is always the coach, even when a student completes their own
half of the invite-link journey.
