---
id: B-090
title: "The deploy's cron step wiped the production crontab and skipped the frontend deploy"
type: incomplete-rule
severity: high
status: open
affects:
  - .github/workflows/deploy-prod.yaml
  - backend/scripts/install_backup_cron.sh
proposed_fix: "Filter with `|| true`, install from a script, read the crontab back and fail unless exactly one backup.sh line is there; install the schedule in its own job so the app's frontend deploy does not depend on it."
opened: 2026-09-16T10:24:00Z
---

# B-090 — The deploy's cron step wiped the crontab instead of installing the backup

**Source:** found by the coordinator during the production promotion, 2026-09-16 10:20 UTC
(run 35084056199, deploy of `f34e99ef3`), read on the VM. Ticket PAD-353. Bug number
self-assigned (unconfirmed until the coordinator vetoes).

**What happened:** the `Install nightly backup cron` step ran, under `set -euo pipefail`:

```
(crontab -l 2>/dev/null | grep -v backup.sh; echo "0 3 * * * .../backup.sh >> .../backup.log 2>&1") | crontab -
```

The VM's crontab held exactly one line — the old `backup.sh` job. `grep -v backup.sh` therefore
matched nothing and exited 1, which under `set -e` killed the subshell **before** the `echo`, so
`crontab -` received an empty document. Verified on the VM at 10:30 UTC:
`/var/spool/cron/crontabs/…` (written 10:20:20) held only its three comment lines. The step
removed the old schedule and installed nothing, so production had **no nightly backup scheduled
at all** — while `backup.sh` and `.backup.env` sat correctly in place.

The step then exited 1 and failed the `backend` job. The `frontend` job is guarded by
`needs.backend.result != 'failure'`, so the **frontend deploy was skipped**: production served
the new backend with the previous web bundle until the frontend was dispatched by hand.

**Two defects, not one:**

1. A filter whose empty match is normal was left fatal. The same shape as any `grep` in a
   pipeline under `set -e`: an empty match is data, not an error.
2. **The step could not fail on the thing it existed to do.** It never read the crontab back, so
   it reported success on every earlier deploy without anything checking a job existed
   afterwards — the same defect class as B-080, which it was installed to fix, and as B-083
   (a test that calls the service proves it sends, not that anything asks it).

**How it is prevented:** `backend/scripts/install_backup_cron.sh` does the install and then reads
the crontab back, failing unless exactly one `backup.sh` line is present; it is exercised from
both starting states (no crontab, and a crontab that already holds the line) in
`test_pad353_backup_cron_install.py`, which also pins what the old one-liner did. The schedule is
installed in its own job, so a scheduling failure can no longer skip the app's frontend deploy.

Related: [[B-080-nightly-prod-backup-is-a-no-op]], R-028.
