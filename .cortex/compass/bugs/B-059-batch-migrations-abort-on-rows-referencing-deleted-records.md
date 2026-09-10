---
id: B-059
title: "Two batch-1 migrations assumed every referenced row still exists; on prod data one aborted the staging deploy"
type: missing-criterion
severity: high
status: resolved
affects:
  - notifications.reminders
  - levels.coach-levels
  - backend/migrations/versions/358e03e9a3a9_pad207_reminder_attempts.py
  - backend/migrations/versions/0efff0790eb0_pad255_level_delete_set_null.py
related_specs:
  - .specflow/specs/notifications/reminders.spec.md
  - .specflow/specs/levels/coach-levels.spec.md
proposed_fix: "PAD-207's backfill skips reminder messages whose lesson instance no longer exists; PAD-255 clears ids that point at no row before creating each SET NULL foreign key."
opened: 2026-09-10T00:00:00Z
resolved: 2026-09-10T00:00:00Z
---

# B-059 — Two batch-1 migrations assumed every referenced row still exists; on prod data one aborted the staging deploy

## What happened

Batch #169 landed on `staging` (96560cc) and the deploy workflow went green, but the API answered
502 from then on. The container restarted 324 times without an OOM: every start runs
`flask db upgrade`, and PAD-207's `reminder_attempts` backfill (`358e03e9a3a9`) inserted a row for
reminder message 109, whose `lessonInstanceId` (12) names a class instance deleted since. The new
table's foreign key to `lesson_instances` refused it, the single upgrade transaction rolled back to
`c0f7ac795cbd`, and the entrypoint exited. Staging is a prod copy per deploy (PAD-200), so prod
holds the same row: promoting the batch unchanged would have taken prod down the same way.

## Why it was missed

The pre-merge dry run upgraded a scratch Postgres built from the migrations: prod's schema, none of
prod's data. Messages outlive the classes they mention (nothing cascades from `lesson_instances`
to `messages`), so a prod database always holds reminders for deleted classes. The seed and the
SQLite suite never do.

PAD-255 (`0efff0790eb0`) had the same blind spot and never got to run: it recreates six foreign
keys as `ON DELETE SET NULL`. Where prod's `create_all`-era schema lacks one of those constraints,
the column can hold ids whose row is gone, and creating the constraint over them aborts in the same
way.

## Fix

- PAD-207's backfill skips a reminder message whose instance no longer exists. Its row could
  never exist anyway: the table cascades on instance delete.
- PAD-255 first sets to NULL any id that points at no row, column by column, then creates the
  constraint. That is exactly what the new `SET NULL` rule does when a row goes. All six columns
  are nullable.

Neither migration had completed anywhere outside test databases, so editing them in place is safe.

## Verification

- `test_reminder_attempts.py::test_backfill_skips_reminders_whose_instance_was_deleted` runs the
  migration on SQLite with foreign keys on, seeded with the staging row's shape. It fails on the
  old migration with the same foreign-key error and passes on the fix.
- A Postgres dry run from `c0f7ac795cbd`, seeded with an orphan reminder and an orphan level id on
  a column stripped of its constraint: the old code fails as staging did; the fixed code upgrades
  to head, re-runs idempotently, and round-trips the downgrade.

## Lesson

A data-bearing migration must be dry-run on prod's data, not only prod's schema. When that is not
possible, every backfill and every new constraint must tolerate references to rows that are gone.

## Follow-up (2026-09-10): the backfill is one statement on Postgres

With the orphan skip in place, the staging deploy still answered 502 for about seven and a half
minutes. The entrypoint runs `flask db upgrade` before gunicorn, and the per-row backfill made up
to four queries per reminder: about five minutes on the VM for 8,371 reminders. The database sync
also stopped and restarted the container partway through, so the upgrade ran twice. Production
would be down as long at promotion.

`358e03e9a3a9` now runs one `INSERT … SELECT` on Postgres (`BACKFILL_INSERT`). It reproduces
`attempt_from_metadata`, the orphan skip, and the player and presence lookups. SQLite, used by the
test suite, keeps the loop. Where Python would raise on a non-numeric id, the statement skips the
row. The migration was edited in place again: production has not run it, and the statement only
inserts missing rows.

Verification:
- **Read-only on `padel_app_staging`** (prod's data, 2026-09-10). The statement's SELECT returns
  the same 8,360 rows the loop wrote, with 0 differences either way on every column. With its
  `NOT EXISTS` filter it would insert 0 rows. It runs in about 1.0 s on the VM (EXPLAIN ANALYZE,
  three runs).
- **Scratch Postgres at `ad97ec649746`,** with 8,403 synthetic reminders in production's shapes and
  11 orphans:
  - On identical copies, the loop and the statement wrote the same 8,350 rows, with 0 differing
    lines.
  - A second upgrade after `stamp` inserted nothing.
  - `" 12 "`, and an empty `lessonInstanceId` beside an `instanceId`, resolve as in Python.
    `"abc"` is skipped.
  - The chain then upgraded to `93731ca0bea7`.
- `test_reminder_attempts.py` (SQLite, the loop) still passes.
