---
id: delivery.repair-diagnostics
status: implementing
depends_on: []
implements: ../../specs-business/delivery/diagnostics-keep-personal-data-off-github.business.md
governed_by: [R-028]
---

# delivery.repair-diagnostics

> Linear: PAD-641 (PAD-602 privacy review, D8). Drafted 2026-10-12 by Session E.

## Intent

`.github/workflows/repair.yaml` (manual dispatch) diagnoses the VM over SSH and prints into the
GitHub Actions log. It printed `docker logs padelapp --tail 200` and `left(query, 120)` from
`pg_stat_activity`; psycopg2 inlines query parameters, so names and e-mails could reach GitHub.

### Surfaces
- **CI** `.github/workflows/repair.yaml`. **Backend test**
  `backend/padel_app/tests/test_pad641_repair_prints_no_personal_data.py`.
- **Web, mobile, admin, API** — no change.

### Entities
- **READS:** none. **WRITES:** none (a file on the VM under `~/repair-logs/`).

## Rules

1. **The app log tail stays on the VM.** `docker logs padelapp --tail 200` is written to
   `~/repair-logs/padelapp-<UTC timestamp>.log` (directory mode 700, file created under
   `umask 077`); files older than 14 days are deleted on each run.
2. **Only counts reach the Actions log.** The job prints the saved file's name and line count,
   the number of lines containing `CRITICAL`, `ERROR`, `WARNING` and `Traceback`, and the ten
   most frequent exception class names (`…Error`, `…Exception`) with their counts. No command
   prints a line of the saved file.
3. **Postgres activity by identifier.** The activity and blocking queries select `pid`, user,
   database, state, `wait_event_type`, `wait_event`, transaction age and `query_id`; no column of
   query text (`query`) is selected.
4. The rest of the job (uptime, `docker ps -a`, backup state per R-028, guest agent, memory and
   disk) is unchanged.

## Acceptance Criteria

### The app log tail goes to a file on the VM (rule 1)
- **Given** `repair.yaml`
- **When** the guard reads its SSH script
- **Then** every `docker logs` command redirects to `"$LOGF"`, and the script sets `umask 077`
  and `mkdir -p -m 700`

### The saved log is only counted (rule 2)
- **Given** `repair.yaml`
- **When** the guard reads every command that names `$LOGF`
- **Then** each is a `grep -c`, `grep -oE`, `wc -l` or `basename`, and none is `cat`, `tail`,
  `head`, `less` or `more` of the file

### Postgres activity shows query ids, never query text (rule 3)
- **Given** `repair.yaml`
- **When** the guard reads each `SELECT … ;`
- **Then** each selects `query_id` and none selects a column named `query`

## Notes

- `query_id` is filled when `compute_query_id` is on, which `auto` does once
  `pg_stat_statements` is preloaded (PAD-590/594 runbook); otherwise it shows empty, and the wait
  events still say what is stuck.
