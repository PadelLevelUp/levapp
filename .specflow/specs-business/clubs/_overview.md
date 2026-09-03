# clubs

## What this is

Business outcomes for the clubs domain: the organizational container everything else in LevApp hangs
off, and how a coach grows it into a team.

## What it covers

- `clubs.coach-runs-a-club-and-its-team` — creating and editing a club, how coach and player membership
  works, and inviting other coaches to join.

## Why it's grouped this way

All three leaves (crud, membership, coach-invitation) describe one continuous outcome — standing up a
club and populating it with people — so a domain this size (3 leaves) gets a single business spec per
the sizing guidance, rather than being split artificially.
