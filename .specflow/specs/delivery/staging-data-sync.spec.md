---
id: delivery.staging-data-sync
status: implementing
depends_on: []
implements: ../../specs-business/delivery/staging-stays-realistic-without-slowing-production.business.md
governed_by: [R-028]
---

# delivery.staging-data-sync

> Linear: PAD-589 (from the PAD-571 speed study, cause 5). Replaces PAD-200's "dump live prod on
> every staging deploy". Drafted 2026-10-10 by Session E (wave 14), after the owner kept prod and
> staging on one VM (PAD-613).

### Intent
Staging's database is restored from the latest nightly backup in GCS instead of a live `pg_dump`
of production, and only when that backup has not been restored yet. A routine staging push whose
backup is already loaded does nothing to the database and does not stop the staging app. A forced
reload and a live copy stay available through `workflow_dispatch`.

### Surfaces
- `backend/scripts/sync-staging-db.sh` (runs on the VM).
- `.github/workflows/deploy-staging.yaml` job `sync-db` and a new `workflow_dispatch` input
  `sync_db` (`auto` / `reload` / `live`).
- Tests: `backend/padel_app/tests/test_pad589_staging_sync.py` (stub `docker`, `gsutil`, `curl`
  on PATH, the R-028 harness of `test_backup_script.py`).
- Web, mobile, the API — no change.

### Entities
- **READS:** the nightly dump objects `$BACKUP_BUCKET/padel_app/padel_app-<stamp>.dump` (written
  by `backup.sh`), and, in `live` mode only, the `padel_app` database.
- **WRITES:** the `padel_app_staging` database; a state file `~/staging-sync.state` on the VM.

### Rules

1. **Source is the nightly dump.** In `auto` and `reload` modes the source is the newest object
   under `$BACKUP_BUCKET/padel_app/` (`gsutil ls … | sort | tail -1`, the selection
   `backup.sh restore-check` uses; the stamp sorts lexicographically), never the
   `padel_app_staging/` prefix. `BACKUP_BUCKET` is read from `~/.backup.env` (written by
   deploy-prod for the same user). The dump is streamed `gsutil cp <object> - | docker exec -i
   postgres pg_restore …`; nothing is written to the VM's disk. An empty object (`gsutil stat`
   Content-Length 0) is never restored.
2. **The same dump is restored once.** The state file holds the object name of the last restore
   that succeeded. In `auto` mode, when the newest dump equals it, the script logs
   `SKIPPED: <object> already restored` and exits 0 **before** stopping the staging app or
   touching the database. One nightly dump means at most one restore per day, tighter than the
   ticket's "at most once per hour".
3. **Success is measured, not assumed.** `pg_restore` exits 1 for ignored errors, so its status is
   not the test. The state file is written only when the restored `users` table has at least one
   row; otherwise the next push tries again.
4. **`reload` restores the newest dump even if already restored.** For a staging database left
   on a migration head the code no longer has (a rebased migration): with deduplication the daily
   wipe that used to clear it is gone.
5. **`live` is the PAD-200 path, by hand only.** `live` streams `pg_dump` of `padel_app` into the
   target as before; it runs only from `workflow_dispatch`, never on push. It records no state, so
   the next `auto` run still restores the next nightly dump.
6. **Unchanged from PAD-200:** the target-database and same-as-source guards; the free-space
   guard; the staging app stopped before and always restarted after (EXIT trap); the target
   schema wiped before the restore; the scrub (push subscriptions, device tokens, every email
   rewritten with the recovery and verification codes cleared); placeholder images in the staging
   bucket only; every failure path of the copy exits 0 and the deploy job keeps
   `continue-on-error`. The scrub's failures are the exception (rule 9a).
7. **A missing source skips.** No `BACKUP_BUCKET`, no `gsutil`, or no dump under the prefix: log
   `SKIPPED: …` and exit 0 without stopping staging.
8. **A stale backup is reported.** When the newest dump's stamp is more than 48 h old the script
   logs `WARNING: newest backup is from <stamp>`, and still restores it if it has not been
   restored (stale data beats no refresh; the backup alarm is `backup.sh`'s job).

9. **(PAD-606) Nothing personal survives a restore.** After every restore, in `auto`, `reload`
   or `live` mode and before staging starts again, `backend/scripts/staging-scrub.sql` runs in the
   staging database in one transaction. It rewrites or clears every column that can hold personal
   data, keeping row counts, ids, dates, statuses and uniqueness:
   - **people** (`users`): `name` → `Coach <id>` / `Player <id>`; `username` → `user<id>`
     (`pending-…` placeholders keep their prefix, which decides whether an account can be
     claimed); `email` → `user<id>@staging.invalid`; `phone`, `abbreviation`,
     `notif_block_reason`, `generated_code` → NULL; `birth_date` → 1 January of the same year (age
     rules keep working); `country` kept; every set `password` → the shared staging password hash
     (rule 10); recovery and verification codes cleared;
   - **invitations**: `coach_invitations.email` rewritten (the guardian-consent table went with
     PAD-644, so there are no guardian contacts to scrub);
   - **free text** → a neutral `<kind> <id>` text: messages, coach notes (both tables),
     evaluation comments and notes, class and class-join request notes, message report reasons,
     calendar block titles and descriptions, lesson titles, descriptions and occurrence notes and
     titles, coach rejection reasons, group-conversation names, deletion-audit labels,
     delivery-incident details, bulk-import file names;
   - **copies in JSON**: name keys dropped from `messages.msg_metadata`; `evaluation_shares.card`
     loses its note and coach name; `replacement_approval_prompts.queue_snapshot`,
     `admin_audit_log.before/after` → NULL (raw SQL: the ORM refuses changes to the audit log);
   - **images**: `object_key` → `images/scrubbed/<id>` (unique; the placeholder step seeds these);
   - **delivery channels**: `push_subscriptions` and `device_tokens` emptied (B's PAD-624 also
     disables Expo sends on staging); `apscheduler_jobs` emptied (the scheduler re-arms on boot);
   - **transient stores**: `auth_rate_limit_hits` (its key names the client) and `realtime_events`
     (bodies copy what the stream sent) emptied;
   Kept on purpose: clubs, courts, exercises and notification templates (business and training
   content), `admin_roles` and the audit log's actor emails (staff, who sign in to the console with
   Google), ids, timestamps and statuses.
9a. **(PAD-606) A failed scrub is never a green job.** The script fails closed and says so in its
   exit code: 0 when it skipped or restored and scrubbed; **3** when the scrub failed after a
   restore (or its file is missing) and the staging schema was wiped, so staging comes up empty;
   **4** when the wipe failed too, so staging may hold unscrubbed data: the app is then left
   stopped. The deploy's `sync-db` job no longer swallows the exit. It writes the sync's restore and
   scrub lines to the job summary and fails on 3 or 4 (or on no exit line at all). It stays
   `continue-on-error`, so the deploy itself does not fail (business rule 6). A scrub's proof is
   the job's log lines plus read-only counts on staging, never a green deploy alone.
10. **One shared password, never in the repo.** The deploy passes the staging secret
   `STAGING_TEST_PASSWORD` to the staging container; the sync script hashes it inside that
   container (werkzeug, as the app does) before stopping it and hands the hash to the scrub. With
   no secret the scrub still runs and sets every password to an unusable value, so a missing secret
   never leaves real hashes behind.
11. **Known tester logins.** The scrub names two accounts so people can sign in to staging:
   `staging-coach` (the coach with the most students) and `staging-student` (that coach's student
   with the lowest id). Both use the shared password. Every other account is reachable as
   `user<id>`.
12. **A guard keeps the scrub complete.** A test reads every `String`, `Text` and `JSON` column
   declared in `backend/padel_app/models/` and fails unless it is named in `staging-scrub.sql` or
   in the guard's short list of non-personal columns, so a new personal column cannot be added
   without deciding how staging treats it.

### Acceptance Criteria

#### A push after the dump was restored leaves staging alone (rules 2, 7)
- **Given** the state file names `padel_app-2026-10-10_0300.dump` and that is the newest dump
- **When** the script runs in `auto` mode
- **Then** it logs `SKIPPED`, exits 0, and calls neither `docker stop`, `pg_restore` nor `pg_dump`

#### A new nightly dump is restored from GCS, not from prod (rules 1, 3)
- **Given** the state file names `padel_app-2026-10-09_0300.dump` and the bucket also holds
  `padel_app-2026-10-10_0300.dump` (and a newer `padel_app_staging/` dump)
- **When** the script runs in `auto` mode and the restored database has 185 users
- **Then** `pg_restore` receives the bytes of `padel_app-2026-10-10_0300.dump`, `pg_dump` is never
  called, the scrub runs, staging is started again, and the state file names the restored object

#### A restore that produced no users is retried next time (rule 3)
- **Given** a new dump and a restore after which `users` counts 0
- **When** the script runs
- **Then** the state file is unchanged and the script exits 0

#### Reload and live are explicit (rules 4, 5)
- **Given** the newest dump is already restored
- **When** the script runs in `reload` mode **Then** it restores that dump again
- **When** it runs in `live` mode **Then** it streams `pg_dump padel_app` and leaves the state file
  unchanged

#### No source, no stop (rule 7)
- **Given** no dump under the prefix, or no `BACKUP_BUCKET`
- **When** the script runs **Then** it logs `SKIPPED`, exits 0, and never calls `docker stop`

#### Live copy only by hand (rule 5)
- **Given** `deploy-staging.yaml`
- **When** the source guard reads job `sync-db`
- **Then** the mode passed to the script is `${{ inputs.sync_db || 'auto' }}` and the
  `workflow_dispatch` input `sync_db` offers exactly `auto`, `reload`, `live`

#### Nothing personal survives a restore (rules 9–11, PAD-606)
- **Given** a staging database with real-looking names, usernames, emails, phones, birth dates,
  messages, notes, evaluations, push subscriptions and device tokens
- **When** `staging-scrub.sql` runs with a password hash
- **Then** no user keeps a real-looking name, username, email, phone or non-1-January birth date;
  every free-text column listed in rule 9 holds the neutral text; push subscriptions, device tokens
  and scheduler jobs are empty; row counts per table are unchanged; `staging-coach` and
  `staging-student` exist and every set password equals the given hash

#### The scrub runs before staging starts (rule 9)
- **Given** a successful restore in any mode
- **When** the sync script continues
- **Then** it runs the scrub file in the staging database before the EXIT trap starts the app, and
  a scrub failure wipes the staging schema first (the app then starts on an empty database)

#### A failed scrub fails the sync job (rule 9a)
- **Given** a restore whose scrub fails
- **When** the sync script ends
- **Then** it exits 3 when the wipe succeeded and 4 when it did not, and on 4 it does not start the
  app again; an already-restored dump in `auto` mode still exits 0
- **And** the workflow's `sync-db` job runs the script without `|| true`, captures its output,
  writes the scrub's lines to the job summary and fails on 3 or 4, while keeping
  `continue-on-error`

#### A new personal column cannot slip through (rule 12)
- **Given** the models on the branch
- **When** the guard runs
- **Then** every String/Text/JSON column is either in the scrub file or in the guard's
  non-personal list

### Notes
- PAD-606 (2026-10-11, owner decision): everything personal is scrubbed, usernames included; the
  login instructions (shared password in the staging secrets, `staging-coach`, `staging-student`,
  `user<id>`) are on the ticket.
- Freshness trade (stated on purpose): staging data is now up to about a day old instead of
  minutes; `reload`/`live` cover the cases where that matters.
- The restore still runs in the Postgres container prod shares, but once per nightly dump instead
  of on every push, and it never reads prod's tables.
- `test_pad498_recovery_code_and_email_change.py` pins the scrub's one-line email UPDATE; it
  stays one line.
