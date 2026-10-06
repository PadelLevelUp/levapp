# admin — Running LevApp from a staff console

## What this is

Outcomes for the people who run LevApp itself, not for coaches or students: approving coaches,
helping users, keeping clubs tidy, flipping platform switches and seeing whether the engine is
healthy, all from a separate staff console instead of the database.

## What it covers

- Staff operate the platform without touching the database: approvals, users, clubs, switches,
  engine health, and later the plan each coach is on.
- Staff act under the company's own Google identity, every change they make is attributable, and
  the coach and student apps carry no staff surface.

## Why it's grouped this way

These outcomes serve LevApp's own team, a different audience from every product domain. Keeping
them apart makes it obvious that nothing here appears in the coach or student apps.

## Related groups

- Authentication: how coaches are approved (the decision moves here, the rules stay there).
- Settings: the old in-app Admin section, which this console replaces.
- Delivery: how changes, including this console, reach production.
