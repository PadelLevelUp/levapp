---
id: R-028
title: "The production database is backed up nightly off the VM, and the backup fails loudly or proves restorable"
source:
  - ../bugs/B-080-nightly-prod-backup-is-a-no-op.md
governs:
  - "backend/scripts/backup.sh"
  - ".github/workflows/deploy-prod.yaml"
  - ".github/workflows/repair.yaml"
  - "backend/terraform/main.tf"
confidence: EXTRACTED
status: active
---

# R-028 — The production database is backed up nightly off the VM, and the backup fails loudly or proves restorable

Postgres data is a bind mount on the prod VM's boot disk (`/data/postgres`); there is no
separate disk and no managed database, so a lost disk is lost data. Every night a compressed
custom-format `pg_dump` of `padel_app` and `padel_app_staging` is written to a private GCS bucket
outside the VM, older dumps are pruned by age, and a run that cannot dump, upload or verify
**exits non-zero and says so** in `~/backup.log` and `~/backup.status` — never a silent success.
A restore of a real dump into a scratch database is proven once after every change to the script.

**Why:** B-080 (2026-09-11). The first `backup.sh` read a variable nothing set, ran `pg_dump`
on the host where Postgres is a container, and uploaded to an empty bucket name; every night
failed and nothing noticed, so production ran for months with no automatic backup.

**How to apply:**
- Dump **inside the container** (`docker exec postgres pg_dump …`): the local socket is trust-
  authenticated, so the script never needs the database password and never depends on the
  deploy's environment.
- The bucket comes from configuration the deploy writes (`~/.backup.env`), never a literal in the
  script; an unset bucket is a failure, not a skip.
- `set -euo pipefail`, an `ERR` trap that logs `BACKUP FAILED`, a status file the repair workflow
  prints; success logs the object and its size.
- Rule number 28 self-assigned on 2026-09-11 (unconfirmed until the coordinator vetoes).
