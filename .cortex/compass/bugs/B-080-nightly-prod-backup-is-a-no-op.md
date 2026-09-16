---
id: B-080
title: "The nightly production database backup cannot have worked: wrong variable, host pg_dump, empty bucket"
type: incomplete-rule
severity: high
status: open
affects:
  - backend/scripts/backup.sh
  - .github/workflows/deploy-prod.yaml
proposed_fix: "Dump inside the postgres container (docker exec … pg_dump -Fc), upload to a private versioned bucket named in config, keep N days, log and alert on failure; verify a restore once."
opened: 2026-09-11T15:10:00Z
---

# B-080 — The nightly production database backup cannot have worked

**Source:** found by Session G while writing the Postgres password-rotation runbook
(`docs/infra/2026-09-11-owner-infra-runbooks.md`, 2026-09-11). Repo evidence only; **not yet
verified on the VM** (SSH is owner-gated) — step 0 of that runbook prints `~/backup.log` and
`which pg_dump`, which settles it.

**What happens:** `deploy-prod.yaml` copies `backend/scripts/backup.sh` to the VM and installs a
cron entry `0 3 * * * ~/backup.sh >> ~/backup.log`. The script:
1. reads `POSTGRES_PASSWORD`, a variable nothing on the VM sets (the containers get `POSTGRES_PW`,
   and cron has no app environment at all);
2. runs `pg_dump -h localhost` **on the host**, where Postgres is a container and no `pg_dump`
   binary is installed by the startup script (`apt-get install docker.io` only);
3. uploads to `BUCKET=""`, so even a successful dump would go to `gsutil cp file /`.

Any one of the three makes the job fail every night; the failures land in `~/backup.log` and
nobody reads it. Production therefore has no restorable backup other than what the owner takes by
hand — and the database is a bind mount on the VM's boot disk (B-048 notes, PAD-230), so a disk
loss is a data loss.

**Why it is type 2:** no rule or spec says "production data is backed up nightly to an off-VM
location and a restore is tested". The script was written for an earlier layout (host Postgres,
a bucket to be filled in) and nothing checked it after the move to containers.

### Change Plan
- Rewrite `backup.sh`: `docker exec postgres pg_dump -U padel_app_user -Fc padel_app` (trust auth on
  the container socket, no password), `gsutil cp` to a private bucket declared in config (a new
  `padel-levelup-2026-backups` with versioning, or a `backups/` prefix on the existing one), keep 14
  daily files, exit non-zero and post to the Discord webhook on failure.
- `deploy-prod.yaml`: keep installing the cron; add a read-only "last backup age" check to the
  repair workflow.
- Verify once by restoring into `padel_app_scratch` on the VM and counting `users`.
- Ticket: to be filed by the coordinator; the rotation runbook takes a manual dump meanwhile.

### Resolution
(open)
