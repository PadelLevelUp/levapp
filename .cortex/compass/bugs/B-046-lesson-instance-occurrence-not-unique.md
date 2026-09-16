---
id: B-046
title: "Nothing in the database stops two lesson instances for the same occurrence; the unique constraint needs a duplicate merge first"
type: incomplete-rule
severity: medium
status: open
affects:
  - backend/padel_app/models/lesson_instances.py
  - backend/padel_app/services/lesson_service.py
  - backend/padel_app/models/vacancy.py
  - .specflow/specs/classes/instances.spec.md
proposed_fix: "Count duplicate (lesson_id, occurrence date) groups on the staging copy of prod; merge each group into its lowest-id instance with every child row re-pointed and the child-table unique collisions resolved; then replace ix_lesson_instances_lesson_id_occurrence_date with a unique constraint in a guarded migration."
opened: 2026-09-10T00:00:00Z
---

# B-046 — Lesson instance occurrences are not unique in the database

**Source:** PAD-263 (audit H11, Session A, 2026-09-10). The audit recommended a UNIQUE index on
`lesson_instances (lesson_id, original_lesson_occurence_date)`. PAD-263 shipped it as a plain
index instead, with the coordinator's agreement, because a unique index over data that already
breaks it fails the upgrade, and a failed upgrade crash-loops staging (a prod copy on every
deploy, PAD-200) and then prod.

**What is wrong:** an occurrence's identity is (lesson, occurrence date): `get_or_materialize_instance`
and `calendar_helpers` both key on it, and `classes.instances` treats it as the occurrence key. Only
the application enforces it. PAD-85's double materialisation created exactly these duplicates, each
with its own set of unconfirmed presences; PAD-85 fixed the lookup but nothing removed duplicates
that already existed, and a race between two materialising requests can still create one.

**Why it was not done in PAD-263:** removing duplicates is a data merge, not an index build. Every
child row has to move to the surviving instance, and five child tables have their own unique
constraints that the move can collide with.

## Plan

1. **Count on the staging copy of prod** (read-only):
   ```sql
   SELECT lesson_id, original_lesson_occurence_date, count(*), array_agg(id ORDER BY id)
   FROM lesson_instances
   WHERE original_lesson_occurence_date IS NOT NULL
   GROUP BY 1, 2 HAVING count(*) > 1;
   ```
   Also count legacy rows with a NULL occurrence date that share a lesson and a calendar day
   (`start_datetime::date`), because `get_or_materialize_instance` treats those as the same
   occurrence. Backfill `original_lesson_occurence_date` for them before step 3, or the
   constraint (NULLs are distinct in Postgres) will not cover them.
2. **Merge each group into its lowest-id instance** (the one the lookup's `ORDER BY id` already
   returns), in one transaction per group. All seven child tables reference
   `lesson_instances.id` with `ON DELETE CASCADE`, so deleting a duplicate BEFORE re-pointing its
   children silently deletes them:

   | Child table | Unique that the re-point can collide with | On collision |
   |---|---|---|
   | `presences` | `(player_id, lesson_instance_id)` | keep the row with a status or confirmation; else the survivor's |
   | `player_in_lesson_instance` | `(player_id, lesson_instance_id)` | drop the duplicate's row |
   | `coach_in_lesson_instance` | `(coach_id, lesson_instance_id)` | drop the duplicate's row |
   | `waiting_list_entries` | `(lesson_instance_id, player_id)` | keep the earliest `joined_at` |
   | `lesson_instance_training` | primary key `(lesson_instance_id, exercise_id)` | drop the duplicate's row |
   | `vacancies` | none | re-point |
   | `notification_events` | none | re-point |

   Then delete the now-childless duplicate instance.
3. **Constrain** in a guarded migration: create `uq_lesson_instance_occurrence` only if absent and
   only if the step-1 query returns nothing (fail with a message naming the duplicate ids otherwise),
   then drop `ix_lesson_instances_lesson_id_occurrence_date`, which the unique index supersedes.
   Declare the constraint on the model in the same change (see the PAD-265 drift entry, #163).
4. **Make materialisation race-safe:** once the constraint exists, `get_or_materialize_instance`
   should catch the `IntegrityError` from a concurrent insert and re-read, instead of failing the
   request.

5. **Deferred from PAD-261 (B-051):** partial unique index on `vacancies (lesson_instance_id,
   original_player_id) WHERE status = 'open' AND original_player_id IS NOT NULL`. PAD-261 only
   locks rows and does get-or-create in code. In the same pass, count duplicate open vacancies per
   key on the staging copy of prod, expire all but the oldest (retiring the invitations still out
   for the expired ones), then add the index.

**Related:** PAD-85 (the duplicates' origin), PAD-263 (the plain index), PAD-261 / B-051 (the deferred
vacancy unique), the PAD-265 drift entry in #163 (keep models and
migrations declaring the same indexes).

## Scan on the staging copy of prod — 2026-09-11 21:27 (Session E ran it, Session I filed it)

Read-only (`default_transaction_read_only=on`) on `padel_app_staging`, prod as of the 21:1x
sync, migrated to `390bf6e8be12` (batch 4). Every query in step 1 returned **0 rows**:

| Scan | Result |
|---|---|
| duplicate `(lesson_id, original_lesson_occurence_date)` groups | 0 |
| legacy NULL-occurrence rows sharing a lesson and a calendar day | 0 |
| open vacancies duplicated per `(lesson_instance_id, original_player_id)` | 0 |

So step 2 (the merge) has nothing to do on today's prod data and step 3 (the unique
constraint, guarded so it still fails loudly if a duplicate appears before it runs) can be the
next migration on this ledger entry. PAD-273's part of the same scan: `coach_levels (coach_id,
code)`, `evaluation_categories (coach_id, name)` and active `standing_waiting_list_entries
(coach_id, player_id)` have 0 collisions and all three `uq_*` indexes exist on the copy; the
nine association tables the migration left nullable hold 0 NULL keys (row counts 1 / 0 / 3 /
52 / 377 / 180 / 2 / 317 / 4420), so their NOT NULL can follow in the same migration. Rerun the
scan in the migration's dry run against a fresh prod copy before promoting — the data moves.
