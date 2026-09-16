---
id: B-091
title: "backup.sh restore-check died on its first run; three more of its paths had never run either"
type: incomplete-rule
severity: medium
status: resolved
affects:
  - backend/scripts/backup.sh
  - backend/padel_app/tests/test_backup_script.py
proposed_fix: "One `local` per dependent assignment; every path of the script that only runs by hand or on a rare condition is driven end to end by a stub docker/gsutil/curl test."
opened: 2026-09-16T15:10:00Z
---

# B-091 — backup.sh restore-check died on its first run

**Source:** the coordinator ran `bash ~/backup.sh restore-check` on the VM on 2026-09-16 after
the first real nightly-style backup (15:08 UTC, both databases, real sizes, in the bucket) and
got `./backup.sh: line 108: db: unbound variable`, exit 1. Ledger number B-091 confirmed by the
coordinator on 2026-09-16. Related: PAD-296, PAD-354, B-080,
R-028; the same family as R-035 — a path written and never executed.

**What happened:** `local db="${1:-padel_app}" scratch="${db}_restore_check"` expands `${db}`
*before* `local` assigns it (arguments to a builtin are expanded first), so under `set -u` the
line is an unbound-variable error on every bash. The backup path had been run; the
restore-check path — the proof that a backup is worth anything — had not, and its first line
could not execute.

**What else had never run (found by enumerating every branch of the script, R-035):**

1. `restore-check` on an empty prefix: `gsutil ls` exits 1 when nothing matches, so the
   pipeline into `latest=` tripped the ERR trap with "unexpected error at line 109" instead of
   the written message "no dump found under …".
2. **A failed prune was silent.** `gsutil rm "$url" && log "PRUNED $url"`: a failing left side
   of `&&` is exempt from `set -e` and from the ERR trap, so a `rm` that failed neither logged
   nor failed. The prune branch has not run yet in production (the bucket is under fourteen
   days old); it would have run for the first time around 2026-09-30.
3. **A failure notification with a quote in it never arrived.** The Discord payload was built
   by string interpolation; the ERR trap's message quotes `$BASH_COMMAND`, which usually holds
   double quotes, so the JSON was invalid, Discord rejected it, and `|| true` swallowed the
   rejection. The path that tells a person the backup failed was itself broken exactly when it
   mattered.

**Resolution (2026-09-16, Session A):**
- `local db`, then `local scratch`, then the rest — one `local` per dependent assignment.
- `latest="$(… || true)"` so the empty-prefix case reaches its own message.
- The prune is `if gsutil rm …; then log PRUNED; else log "PRUNE FAILED …"; fi`: logged, never
  silent, and it does not fail a backup that succeeded (the object is retried the next night).
- `notify` escapes `\` and `"` before building the JSON.
- `test_backup_script.py` drives every one of these paths end to end with stub `docker`,
  `gsutil` and `curl` executables on PATH: restore-check picks the newest dump, feeds its
  bytes to `pg_restore -d <db>_restore_check --no-owner --no-privileges`, counts users, and
  drops the scratch database last — on success, on a failed restore, on zero users, on an
  empty bucket, and for the staging database; a failed prune logs and exits 0; the Discord
  payload parses as JSON when the message contains `"` and `\`. Red first: the five
  restore-check tests died on line 108 against the unfixed script, reproducing the VM failure
  verbatim. `shellcheck` was already warning about the line (SC2318) and nothing ran it.

**Rule this reinforces:** R-034 (a check that has never failed has not been validated) and
R-035 (enumerate the commands against what the system runs). A script path that exists only
to be run by hand is exactly the path that ships untested; it needs the same stub-driven test
as the nightly path, and `shellcheck` now runs over `backend/scripts/*.sh` (bar the Terraform template) in the
backend test job.
