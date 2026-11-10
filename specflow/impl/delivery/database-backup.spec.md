---
id: delivery.database-backup
status: implemented
depends_on: []
serves: [P-DELIVERY-8]
governed_by: []
---

# delivery.database-backup

> Written 2026-11-09 during the spec port, from `backend/scripts/backup.sh`, the cron install script
> and their tests. No ticket: the behaviour predates the specs.

### Intent
The production server dumps its databases every night to a bucket, proves now and then that the
newest dump restores, and tells the owner when a backup fails. `delivery.staging-data-sync` reads
the same dumps.

### Rules
1. **A backup dumps each database from inside the Postgres container and uploads it.** `backup.sh`
   runs `pg_dump -Fc` through `docker exec`, never over the network, for the production and the
   staging database, and uploads one object per database to `BACKUP_BUCKET`. It prints
   `BACKUP OK <database>` for each and records `ok` in `~/backup.status`. After the uploads it
   deletes dumps older than the retention; a delete that fails is logged as `PRUNE FAILED` and does
   not fail the backup.
2. **A backup that cannot finish fails loudly and leaves nothing partial.** It exits non-zero,
   prints `BACKUP FAILED`, records `failed` in `~/backup.status` and removes the object it was
   writing. A `BACKUP_BUCKET` that is unset or is not a `gs://` address is a failure, never a skip,
   and nothing is dumped. When an alerts webhook is configured the failure is posted to it as valid
   JSON, whatever characters the message holds.
3. **The restore check proves the newest dump restores.** It restores the newest dump of a database
   into a scratch database, counts the users, and drops the scratch database whether it passed or
   not. It fails when there is no dump, when the restore fails, and when the users table is empty.
4. **The deploy installs the nightly job.** The production deploy runs the install script, which
   leaves exactly one `backup.sh` line in the crontab, at 03:00, and every other job as it was; a
   second run changes nothing. An install that does not leave that one line fails the deploy step.

### Acceptance Criteria

#### DELIVERY-DATABASE-BACKUP-1: A backup dumps each database inside the container, uploads it and prunes old dumps (rule 1)
- **Given** the production server with its two databases and a bucket that holds one very old dump
- **When** the backup runs
- **Then** each database is dumped through `docker exec` and never over the network, and the bucket gains one dump per database
- **And** it prints `BACKUP OK` for each and records `ok`
- **And** the very old dump is deleted; if that delete fails the run prints `PRUNE FAILED` and still succeeds
test: `backend/padel_app/tests/test_backup_script.py` › `test_dumps_both_databases_inside_the_container_and_uploads_them` (+2 more)

#### DELIVERY-DATABASE-BACKUP-2: A backup that cannot finish says so and leaves nothing partial (rule 2)
- **Given** a dump that fails half-way, and a server with no `BACKUP_BUCKET`
- **When** the backup runs
- **Then** it exits non-zero, prints `BACKUP FAILED`, records `failed` and leaves no dump in the bucket
- **And** with no bucket set it fails naming `BACKUP_BUCKET`, and nothing is dumped
- **And** the alert it posts is valid JSON
test: `backend/padel_app/tests/test_backup_script.py` › `test_a_failing_dump_exits_non_zero_says_so_and_leaves_no_partial_object` (+2 more)

#### DELIVERY-DATABASE-BACKUP-3: The restore check proves the newest dump restores, and cleans up (rule 3)
- **Given** a bucket with several dumps of a database
- **When** the restore check runs
- **Then** the newest dump is restored into a scratch database, its users are counted, and the scratch database is dropped
- **And** it fails when there is no dump, when the restore fails, and when the users table is empty
test: `backend/padel_app/tests/test_backup_script.py` › `test_restore_check_restores_the_latest_dump_into_a_scratch_database_and_drops_it` (+4 more)

#### DELIVERY-DATABASE-BACKUP-4: The deploy leaves exactly one nightly backup job (rule 4)
- **Given** a server with no backup job, with an older backup line, and with other jobs in its crontab
- **When** the install script runs, once and again
- **Then** the crontab holds one `backup.sh` line at 03:00, and the other jobs are as they were
- **And** a second run leaves the crontab identical
- **And** an install that leaves no backup line exits non-zero with an `::error::`
test: `backend/padel_app/tests/test_pad353_backup_cron_install.py` › `test_an_install_that_does_not_take_fails_the_step` (+3 more)

### Open questions

- **Two branches of the script have no test.** A dump that uploads as an empty object fails the backup (`backup.sh:95-96`), and the restore check drops the scratch database before failing on an empty users table. Recommendation: add both.
- **The retention period is not stated here.** Rule 1 says "older than the retention" because the tests use dates far apart and no document gives the number of days. Recommendation: state the period.
