---
id: B-679
title: "The staging scrub ran on prod's schema before the migrate step and failed on a table only staging's head has (push_outbox): staging was wiped"
type: incomplete-rule
severity: high
status: triaged
affects:
  - delivery.staging-data-sync
  - backend/scripts/sync-staging-db.sh
proposed_fix: "Run the migrate step on the restored copy before the scrub (rule 9b); a failed migrate step fails closed like a failed scrub."
opened: 2026-10-23T05:05:00Z
---

# B-679: the scrub ran before the migrate step

**Source:** the #796 staging deploy, run 39902757486, job `sync-db` (the scrub's first real run,
PAD-606).

**What happens:** the restore of `padel_app-2026-10-23_0300.dump` finished cleanly (561 users).
Then the scrub stopped at `psql:<stdin>:115: ERROR: relation "push_outbox" does not exist`, and
the script failed closed: `padel_app_staging` was wiped and the job exited 3. Staging came up empty
at `573da995cdbd`.

**What should happen:** the restored copy is scrubbed and staging serves it.

**Root cause:** rule 9 said when the scrub runs ("after every restore, before staging starts
again") but not where it runs relative to the migrate step. The script ran it before. The dump
carries prod's schema (head `e532fea8c4d4`). `staging-scrub.sql` is written and guarded for the
image's head, which also has `573da995cdbd` (PAD-699, `push_outbox`), and its `DELETE FROM
push_outbox;` failed. Every unpromoted migration that adds a scrubbed table or column hits the same
failure (#817's finance tables would have been next).

**Evidence:** the job log above. The Postgres test walks a seeded database down to `e532fea8c4d4`.
There, the scrub raises `relation ... does not exist`. After `upgrade` it completes (test
`test_on_postgres_a_restore_behind_head_is_scrubbed_after_the_migrate_step`).

**Not affected:** the retry. The state file is written only after a successful scrub. So after an
exit 3 it still names the previous dump, and the next `auto` push restores again (test
`test_after_a_failed_scrub_the_next_push_restores_the_same_dump_again`).

### Change Plan

Type 2 (incomplete rule): add rule 9b to `delivery.staging-data-sync`, saying that the migrate step
runs before the scrub, once, and that a failed migrate step is a failed scrub. Add criteria for both,
plus one for a restore behind head and one for the retry. Then change the script and the workflow's
summary lines.

Rejected: making each statement tolerate a missing table (`to_regclass`). It skips a whole table
silently. It does nothing for a personal column that an unpromoted migration adds to an existing
table, or for rows a migration backfills.

### Resolution

Resolved when the fix PR merges and a staging deploy's `sync-db` job shows the migrate line, then
"scrub done", with exit 0.
