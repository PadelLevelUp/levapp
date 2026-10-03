---
id: B-283
title: "A migration-walk test that seeds rows through the current ORM breaks when any later migration adds a column"
type: test-defect
severity: high
status: resolved
opened: 2026-10-03T01:23:48Z
resolved: 2026-10-03T01:23:48Z
updated: 2026-10-03T01:23:48Z
affects:
  - backend/padel_app/tests/helpers.py
  - backend/padel_app/tests/test_pad279_migration_postgres.py
  - backend/padel_app/tests/test_pad363_migration_postgres.py
  - backend/padel_app/tests/test_pad403_migration_postgres.py
  - backend/padel_app/tests/test_pad404_migration_postgres.py
  - backend/padel_app/tests/test_pad423_scale_migration.py
  - backend/padel_app/tests/test_pad431_migration.py
proposed_fix: "Seed walk-test rows by raw SQL naming only the columns the old schema has (a shared helper), and make every walk return to head even after a failure."
---

# B-283: walk tests that seed through the current ORM break on the next new column

**Source:** PR #517 (PAD-485) and batch #525, 2026-10-02/03. The "pytest (postgres, real migrations)" lane
showed 1 failed and 1418 errors (run 37057343771).

**What happens:** a migration-walk test downgrades the database to an older revision, seeds rows there,
and upgrades again. Six such tests seeded `users` through the ORM (`User(...)`), whose INSERT names
every column the **current** model has. PAD-485 added `users.terms_accepted_at`, `terms_version` and
`privacy_version`, which do not exist at the older revision, so each of the six raised
`UndefinedColumn`.

The pad279 walk's `finally` then committed the failed session. That raised, its `upgrade()` never
ran, and the database stayed at the older revision, so every test after it met missing tables
(`relation "evaluation_shares" does not exist`). CI therefore showed one failure plus 1418 errors and
hid the other five walks.

**Root cause (diagnostic tree):** the walk tests depended on the current model matching an older schema;
nothing guarded that. Type 1, a missing check. It surfaces whenever a migration adds a column to a table
a walk test seeds through the ORM; this time it was the first new `users` column since those walks were
written.

### Change Plan
- **Shared helper:** `tests/helpers.insert_user_on_an_old_schema(username, name)` inserts by raw SQL,
  naming only the columns every old schema has, and returns `.id`. All six walks use it.
- **Always return to head:** the pad279 `finally` rolls back before it upgrades, so the database
  returns to head even after a failure.

### Resolution (PAD-485, commit ac0bea5aa)

- **Helper and pad279 `finally` landed** as above.
- **Verified on Postgres:** all 17 walk and Postgres-only test files pass.
- **Guideline for new walks:** seed through `insert_user_on_an_old_schema`, or raw SQL, never the
  current ORM for a table a later migration may widen.
