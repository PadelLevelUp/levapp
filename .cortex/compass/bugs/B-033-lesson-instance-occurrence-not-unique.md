---
id: B-033
title: "Nothing in the database stops two lesson instances for the same occurrence; the unique constraint needs a duplicate merge first"
type: incomplete-rule
severity: medium
status: open
affects:
  - backend/padel_app/models/lesson_instances.py
  - backend/padel_app/services/lesson_service.py
  - .specflow/specs/classes/instances.spec.md
proposed_fix: "Count duplicate (lesson_id, occurrence date) groups on the staging copy of prod; merge each group into its lowest-id instance with every child row re-pointed and the child-table unique collisions resolved; then replace ix_lesson_instances_lesson_id_occurrence_date with a unique constraint in a guarded migration."
opened: 2026-09-10T00:00:00Z
---

# B-033 — Lesson instance occurrences are not unique in the database

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
   Declare the constraint on the model in the same change (B-032).
4. **Make materialisation race-safe:** once the constraint exists, `get_or_materialize_instance`
   should catch the `IntegrityError` from a concurrent insert and re-read, instead of failing the
   request.

**Related:** PAD-85 (the duplicates' origin), PAD-263 (the plain index), B-032 (keep models and
migrations declaring the same indexes).
