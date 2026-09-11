#!/usr/bin/env bash
# =============================================================================
# LevApp — nightly database backup (PAD-296, B-080; compass R-028)
#
# Dumps every database in BACKUP_DATABASES from INSIDE the postgres container
# (the local socket is trust-authenticated, so no password is needed and the
# script does not depend on the deploy's environment), streams each dump into
# a private GCS bucket, verifies the object is non-empty, prunes dumps older
# than BACKUP_RETENTION_DAYS, and writes ~/backup.status.
#
# ANY failure exits non-zero, logs "BACKUP FAILED …", writes "failed …" to the
# status file and (if DISCORD_WEBHOOK_URL is set) posts to Discord. A silent
# success is exactly the defect this replaces.
#
# Configuration — ~/.backup.env (written by deploy-prod.yaml) or the environment:
#   BACKUP_BUCKET          gs://bucket[/prefix]   REQUIRED
#   BACKUP_RETENTION_DAYS  default 14
#   BACKUP_DATABASES       default "padel_app padel_app_staging"
#   PG_CONTAINER           default postgres
#   PG_USER                default padel_app_user
#   DISCORD_WEBHOOK_URL    optional
#
# Usage:
#   backup.sh                 nightly run (cron: 0 3 * * *)
#   backup.sh restore-check   restore the latest padel_app dump into a scratch
#                             database, count users, drop it (proof of restorability)
# =============================================================================
set -euo pipefail

CONFIG_FILE="${BACKUP_CONFIG:-$HOME/.backup.env}"
if [ -f "$CONFIG_FILE" ]; then
  # file values are defaults; anything already in the environment wins
  while IFS='=' read -r key value; do
    [ -n "$key" ] || continue
    if [ -z "${!key:-}" ]; then export "$key=$value"; fi
  done < <(grep -E '^[A-Z_][A-Z0-9_]*=' "$CONFIG_FILE")
fi

PG_CONTAINER="${PG_CONTAINER:-postgres}"
PG_USER="${PG_USER:-padel_app_user}"
BACKUP_DATABASES="${BACKUP_DATABASES:-padel_app padel_app_staging}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
STATUS_FILE="${BACKUP_STATUS_FILE:-$HOME/backup.status}"

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
log() { printf '%s %s\n' "$(now)" "$*"; }

notify() {
  [ -n "${DISCORD_WEBHOOK_URL:-}" ] || return 0
  curl -fsS -m 10 -H 'Content-Type: application/json' \
    -d "{\"content\": \"levapp backup ($(hostname)): $1\"}" "$DISCORD_WEBHOOK_URL" >/dev/null 2>&1 || true
}

fail() {
  log "BACKUP FAILED $*"
  printf 'failed %s %s\n' "$(now)" "$*" > "$STATUS_FILE" 2>/dev/null || true
  notify "BACKUP FAILED $*"
  exit 1
}
trap 'fail "unexpected error at line $LINENO: $BASH_COMMAND"' ERR

# Days ago as YYYY-MM-DD: python3 (Debian VM and macOS), else GNU date, else BSD date.
cutoff_date() {
  python3 -c "import datetime; print((datetime.datetime.utcnow() - datetime.timedelta(days=int('$1'))).strftime('%Y-%m-%d'))" 2>/dev/null \
    || date -u -d "-$1 days" +%Y-%m-%d 2>/dev/null \
    || date -u -v-"$1"d +%Y-%m-%d
}

[ -n "${BACKUP_BUCKET:-}" ] || fail "BACKUP_BUCKET is not set — the deploy writes it to ~/.backup.env"
BACKUP_BUCKET="${BACKUP_BUCKET%/}"
case "$BACKUP_BUCKET" in gs://*) ;; *) fail "BACKUP_BUCKET must be a gs:// url, got '$BACKUP_BUCKET'" ;; esac
command -v docker >/dev/null 2>&1 || fail "docker is not on PATH"
command -v gsutil >/dev/null 2>&1 || fail "gsutil is not on PATH (apt-get install google-cloud-cli)"

pg() { docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$1" -Atc "$2"; }

backup() {
  local stamp db object size cutoff url name day
  stamp="$(date -u +%Y-%m-%d_%H%M)"
  cutoff="$(cutoff_date "$BACKUP_RETENTION_DAYS")"
  for db in $BACKUP_DATABASES; do
    object="$BACKUP_BUCKET/$db/$db-$stamp.dump"
    # Streamed: no dump ever touches the VM's small disk. `if !` keeps the ERR
    # trap out of the pipeline so a half-uploaded object can be removed first.
    if ! docker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" -Fc "$db" | gsutil cp - "$object"; then
      gsutil rm "$object" >/dev/null 2>&1 || true
      fail "dump or upload of $db to $object"
    fi
    size="$(gsutil stat "$object" | awk '/Content-Length/ {print $2}')"
    [ "${size:-0}" -gt 0 ] || { gsutil rm "$object" >/dev/null 2>&1 || true; fail "$object is empty"; }
    log "BACKUP OK $db $size bytes $object"

    # Prune by the date in the object name (older than the retention window).
    for url in $(gsutil ls "$BACKUP_BUCKET/$db/" 2>/dev/null || true); do
      name="${url##*/}"
      day="${name#"$db"-}"; day="${day:0:10}"
      [[ "$day" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || continue
      if [[ "$day" < "$cutoff" ]]; then
        gsutil rm "$url" && log "PRUNED $url"
      fi
    done
  done
  printf 'ok %s\n' "$(now)" > "$STATUS_FILE"
  log "BACKUP COMPLETE"
}

restore_check() {
  local db="${1:-padel_app}" scratch="${db}_restore_check" latest users
  latest="$(gsutil ls "$BACKUP_BUCKET/$db/" | sort | tail -1)"
  [ -n "$latest" ] || fail "restore-check: no dump found under $BACKUP_BUCKET/$db/"
  log "RESTORE CHECK restoring $latest into $scratch"
  pg postgres "DROP DATABASE IF EXISTS $scratch" >/dev/null
  pg postgres "CREATE DATABASE $scratch" >/dev/null
  if ! gsutil cp "$latest" - | docker exec -i "$PG_CONTAINER" pg_restore -U "$PG_USER" -d "$scratch" --no-owner --no-privileges; then
    pg postgres "DROP DATABASE IF EXISTS $scratch" >/dev/null || true
    fail "restore-check: pg_restore of $latest failed"
  fi
  users="$(pg "$scratch" 'select count(*) from users')"
  pg postgres "DROP DATABASE IF EXISTS $scratch" >/dev/null
  [ "${users:-0}" -gt 0 ] || fail "restore-check: restored database has no users"
  log "RESTORE CHECK OK $latest users=$users"
}

case "${1:-backup}" in
  backup) backup ;;
  restore-check) restore_check "${2:-padel_app}" ;;
  *) echo "usage: backup.sh [backup|restore-check [db]]" >&2; exit 2 ;;
esac
