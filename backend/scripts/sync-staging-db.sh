#!/bin/bash
# =============================================================================
# sync-staging-db.sh — refresh the STAGING database (PAD-200, PAD-589)
#
# Runs ON THE VM, invoked by deploy-staging.yaml after the staging backend
# container is up. Replaces `padel_app_staging` with a copy of production data,
# then runs the migrate step (PAD-691: scripts/migrate.sh in a one-shot container
# of the staging app's own image, env and network) and restarts the staging app,
# so the copied schema matches staging's code (staging can carry migrations prod
# does not have yet). The app no longer migrates itself: it refuses to start
# against a schema behind its head.
#
# Source (PAD-589, spec delivery.staging-data-sync), by MODE (2nd argument):
#   auto   (every push)  the newest NIGHTLY DUMP in GCS ($BACKUP_BUCKET/padel_app/,
#                        written by backup.sh), and only if that dump has not been
#                        restored yet (~/staging-sync.state). Otherwise exit before
#                        touching staging. Live prod is never read.
#   reload (by hand)     the newest nightly dump, even if already restored.
#   live   (by hand)     the PAD-200 path: pg_dump of live prod. Records no state.
#
# Contract (PAD-200, still true):
#   * no anonymisation — prod data is copied as-is (staging has no push / mail
#     / AI credentials, so copied students can never be contacted from it);
#   * BEST-EFFORT: nothing here may fail the deploy. Every failure path logs
#     and exits 0, and the staging app is always started again (EXIT trap).
#
# Safety:
#   * the target must be exactly `padel_app_staging` (read from .env.staging),
#     and must differ from the source — otherwise the script refuses to run;
#   * prod is only ever READ (pg_dump); nothing writes to `padel_app`;
#   * dump is streamed straight into restore — no dump file on the VM's disk,
#     which has filled up twice — and the copy is skipped when free space is
#     below MIN_FREE_MB;
#   * the staging app is stopped and stray connections terminated before the
#     restore, and the target's `public` schema is dropped and recreated so
#     the restore always lands on an empty schema (staging-only tables that
#     prod does not have would otherwise block `--clean`).
#
# Usage:  bash sync-staging-db.sh [/path/to/.env.staging] [auto|reload|live]
# Env overrides: APP_CONTAINER, WORKER_CONTAINER, PG_CONTAINER, SOURCE_DB, MIN_FREE_MB,
#                HEALTH_URL, EXPECTED_TARGET_DB, BACKUP_CONFIG, BACKUP_BUCKET,
#                SYNC_STATE_FILE, SYNC_STALE_HOURS, SYNC_NOW_EPOCH (tests)
# =============================================================================
set -uo pipefail

ENV_FILE="${1:-$HOME/.env.staging}"
APP_CONTAINER="${APP_CONTAINER:-padelapp_staging}"
# PAD-695 (delivery.worker-role): with WORKER_SPLIT on, the scheduler's jobs run here; it is
# stopped with the API (it holds connections to the target and would run jobs mid-restore) and
# started again after it.
WORKER_CONTAINER="${WORKER_CONTAINER:-${APP_CONTAINER}_worker}"
# PAD-704: the second API copy holds connections too; stopped and started with the API.
SECOND_COPY="${SECOND_COPY:-${APP_CONTAINER}_b}"
PG_CONTAINER="${PG_CONTAINER:-postgres}"
SOURCE_DB="${SOURCE_DB:-padel_app}"
EXPECTED_TARGET_DB="${EXPECTED_TARGET_DB:-padel_app_staging}"
MIN_FREE_MB="${MIN_FREE_MB:-1024}"
HEALTH_URL="${HEALTH_URL:-}"  # default: the port the staging app publishes now (PAD-588: 5100 or 5102)
MODE="${2:-auto}"
STATE_FILE="${SYNC_STATE_FILE:-$HOME/staging-sync.state}"
STALE_HOURS="${SYNC_STALE_HOURS:-48}"

log() { echo "[sync-staging-db] $*"; }
skip() { log "SKIPPED: $*"; exit 0; }

# ── 1. Read the staging DB identity from .env.staging (KEY=VALUE lines only) ──
case "$MODE" in auto|reload|live) ;; *) skip "unknown mode '$MODE' (auto, reload or live)" ;; esac
[ -f "$ENV_FILE" ] || skip "env file not found: $ENV_FILE"
PG_USER=$(grep -E '^POSTGRES_USER=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '[:space:]')
TARGET_DB=$(grep -E '^POSTGRES_DB=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '[:space:]')
PG_USER="${PG_USER:-padel_app_user}"
# Staging's own uploads bucket (PAD-217), used by step 6 to seed placeholders.
GCS_UPLOADS_BUCKET="${GCS_UPLOADS_BUCKET:-$(grep -E '^GCS_UPLOADS_BUCKET=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '[:space:]')}"

# ── 2. Guards — the only way this can touch prod is by pointing at it ────────
[ "$TARGET_DB" = "$EXPECTED_TARGET_DB" ] \
  || skip "target database is '$TARGET_DB', expected '$EXPECTED_TARGET_DB' — refusing"
[ "$TARGET_DB" != "$SOURCE_DB" ] || skip "target equals source ($SOURCE_DB) — refusing"
command -v docker >/dev/null || skip "docker not found"
docker inspect "$PG_CONTAINER" >/dev/null 2>&1 || skip "container '$PG_CONTAINER' not found"
docker inspect "$APP_CONTAINER" >/dev/null 2>&1 || skip "container '$APP_CONTAINER' not found"

FREE_MB=$(df -Pm / | awk 'NR==2 {print $4}')
if [ -z "$FREE_MB" ] || [ "$FREE_MB" -lt "$MIN_FREE_MB" ]; then
  skip "only ${FREE_MB:-?} MB free on /, need ${MIN_FREE_MB} MB"
fi

pg() { docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$1" -Atc "$2"; }

# ── 2b. Pick the source; in auto mode, stop here if it is already restored ──
# Everything up to the `docker stop` below must leave staging untouched: a push
# whose dump is already loaded costs one `gsutil ls` and nothing else (rule 2).
DUMP=""
if [ "$MODE" = "live" ]; then
  SOURCE_USERS=$(pg "$SOURCE_DB" "select count(*) from users;" 2>/dev/null || echo "?")
  log "mode live: source $SOURCE_DB has $SOURCE_USERS users; target $TARGET_DB; ${FREE_MB} MB free"
else
  BACKUP_CONFIG="${BACKUP_CONFIG:-$HOME/.backup.env}"
  if [ -z "${BACKUP_BUCKET:-}" ] && [ -f "$BACKUP_CONFIG" ]; then
    BACKUP_BUCKET=$(grep -E '^BACKUP_BUCKET=' "$BACKUP_CONFIG" | tail -1 | cut -d= -f2- | tr -d '[:space:]')
  fi
  [ -n "${BACKUP_BUCKET:-}" ] || skip "no BACKUP_BUCKET (in $BACKUP_CONFIG, written by deploy-prod)"
  BACKUP_BUCKET="${BACKUP_BUCKET%/}"
  command -v gsutil >/dev/null 2>&1 || skip "gsutil not found"
  # The selection backup.sh restore-check uses: the stamp sorts lexicographically.
  # Only the prod prefix; padel_app_staging/ dumps are never a source.
  DUMP=$(gsutil ls "$BACKUP_BUCKET/$SOURCE_DB/" 2>/dev/null | grep -E "/$SOURCE_DB-[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{4}\.dump$" | sort | tail -1 || true)
  [ -n "$DUMP" ] || skip "no nightly dump under $BACKUP_BUCKET/$SOURCE_DB/"
  DUMP_SIZE=$(gsutil stat "$DUMP" 2>/dev/null | awk '/Content-Length/ {print $2}')
  [ "${DUMP_SIZE:-0}" -gt 0 ] 2>/dev/null || skip "$DUMP is empty"
  if [ "$MODE" = "auto" ] && [ -f "$STATE_FILE" ] && [ "$(head -1 "$STATE_FILE")" = "$DUMP" ]; then
    skip "$DUMP already restored"
  fi
  # Rule 8: say so when the newest backup is old (backup.sh owns the alarm).
  STAMP="${DUMP##*/$SOURCE_DB-}"; STAMP="${STAMP%.dump}"
  NOW_EPOCH="${SYNC_NOW_EPOCH:-$(date -u +%s)}"
  DUMP_EPOCH=$(python3 -c "import calendar,datetime,sys; print(calendar.timegm(datetime.datetime.strptime(sys.argv[1], '%Y-%m-%d_%H%M').timetuple()))" "$STAMP" 2>/dev/null || echo "")
  if [ -n "$DUMP_EPOCH" ] && [ $((NOW_EPOCH - DUMP_EPOCH)) -gt $((STALE_HOURS * 3600)) ]; then
    log "WARNING: newest backup is from $STAMP (more than ${STALE_HOURS} h old)"
  fi
  log "mode $MODE: source $DUMP (${DUMP_SIZE} bytes); target $TARGET_DB; ${FREE_MB} MB free"
fi

# ── 3. Stop the staging app; ALWAYS start it again, whatever happens below ──
# PAD-691 (delivery.zero-downtime-deploy rule 9): the restored copy is brought to staging's head
# by the same migrate step the deploy runs, in a one-shot container of the staging app's own
# image, env and network (read from `docker inspect`, so nothing here can drift from the
# container). The env goes through a mode-600 file, never `-e` on the command line (`ps`).
# An env-file holds one KEY=VALUE per line, so a multi-line value (a PEM key) is left out and
# named in the log (the migration needs the database settings, not those); variables the image
# itself sets are left out too, so the image's own ENV (PATH, Python, SCHEMA_GATE) applies.
write_migrate_env() {
  python3 - "$APP_CONTAINER" "$1" "$2" <<'PYEOF'
import json, subprocess, sys
container, image, out = sys.argv[1:]
def env_of(*cmd):
    return json.loads(subprocess.check_output(["docker", *cmd, "-f", "{{json .Config.Env}}"]) or b"null") or []
image_env = set(env_of("image", "inspect", image))
skipped = []
with open(out, "w") as f:
    for kv in env_of("inspect", container):
        if kv in image_env:
            continue
        if "\n" in kv or "\r" in kv:
            skipped.append(kv.split("=", 1)[0])
            continue
        f.write(kv + "\n")
if skipped:
    print("[sync-staging-db] not passed to the migrate step (multi-line): " + ", ".join(skipped))
PYEOF
}
migrate_restored() {
  local image network envfile rc
  image=$(docker inspect -f '{{.Config.Image}}' "$APP_CONTAINER" 2>/dev/null)
  [ -n "$image" ] || { log "WARNING: cannot read the image of $APP_CONTAINER: not migrating"; return 1; }
  network=$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$APP_CONTAINER" 2>/dev/null)
  case "$network" in ""|default|bridge|host|none)
    network=$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$APP_CONTAINER" 2>/dev/null | awk '{print $1}') ;;
  esac
  envfile=$(umask 077 && mktemp) || { log "WARNING: mktemp failed: not migrating"; return 1; }
  if ! write_migrate_env "$image" "$envfile"; then
    rm -f "$envfile"; log "WARNING: could not read $APP_CONTAINER's env: not migrating"; return 1
  fi
  log "migrate step: one-shot ${APP_CONTAINER}_migrate of $image${network:+ on $network}"
  docker rm -f "${APP_CONTAINER}_migrate" >/dev/null 2>&1 || true
  docker run --rm --name "${APP_CONTAINER}_migrate" ${network:+--network "$network"} \
    --env-file "$envfile" "$image" /app/scripts/migrate.sh
  rc=$?
  rm -f "$envfile"
  [ "$rc" = 0 ] || log "WARNING: the migrate step exited $rc: $APP_CONTAINER will refuse to start behind head"
  return "$rc"
}

restart_app() {
  migrate_restored || true
  log "starting $APP_CONTAINER"
  docker start "$APP_CONTAINER" >/dev/null 2>&1 || log "WARNING: could not start $APP_CONTAINER"
  if [ "$copy_stopped" = 1 ]; then
    log "starting $SECOND_COPY"
    docker start "$SECOND_COPY" >/dev/null 2>&1 || log "WARNING: could not start $SECOND_COPY"
  fi
  if [ "$worker_stopped" = 1 ]; then
    log "starting $WORKER_CONTAINER"
    docker start "$WORKER_CONTAINER" >/dev/null 2>&1 || log "WARNING: could not start $WORKER_CONTAINER"
  fi
  if [ -z "$HEALTH_URL" ]; then
    local port
    port=$(docker port "$APP_CONTAINER" 80 2>/dev/null | head -1 | sed -E 's/.*:([0-9]+)$/\1/')
    HEALTH_URL="http://127.0.0.1:${port:-5100}/api/app/healthz"
  fi
  # Report health so the deploy log shows whether staging came back.
  for _ in $(seq 1 45); do
    if curl -sf -m 3 "$HEALTH_URL" >/dev/null 2>&1; then
      log "staging healthy; $TARGET_DB now has $(pg "$TARGET_DB" 'select count(*) from users;' 2>/dev/null || echo '?') users"
      return 0
    fi
    sleep 2
  done
  log "WARNING: staging did not report healthy within 90s"
}
worker_stopped=0
copy_stopped=0
trap restart_app EXIT

# PAD-606 rule 10: the shared staging password, hashed by the app's own werkzeug inside the running
# staging container (the secret reaches it as STAGING_TEST_PASSWORD; it is never in the repo or
# printed). Empty when the secret is missing: the scrub then sets an unusable password.
PWHASH=$(docker exec "$APP_CONTAINER" python -c 'import os
from werkzeug.security import generate_password_hash
p = os.environ.get("STAGING_TEST_PASSWORD", "")
print(generate_password_hash(p) if p else "")' 2>/dev/null || true)
[ -n "$PWHASH" ] || log "WARNING: no STAGING_TEST_PASSWORD in $APP_CONTAINER; scrubbed accounts get no usable password"

docker stop "$APP_CONTAINER" >/dev/null 2>&1 || log "WARNING: could not stop $APP_CONTAINER"
if docker inspect "$SECOND_COPY" >/dev/null 2>&1; then
  copy_stopped=1
  docker stop "$SECOND_COPY" >/dev/null 2>&1 || log "WARNING: could not stop $SECOND_COPY"
fi
if docker inspect "$WORKER_CONTAINER" >/dev/null 2>&1; then
  worker_stopped=1
  docker stop -t 60 "$WORKER_CONTAINER" >/dev/null 2>&1 || log "WARNING: could not stop $WORKER_CONTAINER"
fi
pg postgres "select pg_terminate_backend(pid) from pg_stat_activity where datname = '$TARGET_DB' and pid <> pg_backend_pid();" >/dev/null 2>&1 || true

# ── 4. Copy: prod dump streamed into an EMPTY target schema ─────────────────
# Wipe the target schema first instead of relying on `pg_restore --clean`.
# `--clean` only drops objects that exist in the dump, so a table staging has
# and prod does not yet (a migration ahead of prod — e.g. coach_join_tokens
# referencing coaches/clubs/users) blocks the DROP of the prod tables it points
# at: "cannot drop table users because other objects depend on it". The
# restore then half-applies over the old schema, the
# `flask db upgrade` trips on objects that already exist, and staging answers
# 502 (2026-09-07, first deploy after PAD-210..215). Dropping the schema takes
# every object with it, whatever its origin; prod's dump recreates the schema.
log "wiping schema public on $TARGET_DB"
pg "$TARGET_DB" "drop schema if exists public cascade; create schema public;" >/dev/null \
  || log "WARNING: could not wipe schema public on $TARGET_DB"
# pg_restore exits 1 for non-fatal "errors ignored"; the restore itself has
# still completed. Log and go on.
if [ "$MODE" = "live" ]; then
  log "copying $SOURCE_DB -> $TARGET_DB (streamed, no dump file)"
  if docker exec "$PG_CONTAINER" sh -c \
    "pg_dump -U '$PG_USER' -Fc '$SOURCE_DB' | pg_restore -U '$PG_USER' -d '$TARGET_DB' --no-owner --no-privileges"; then
    log "copy finished cleanly"
  else
    log "copy finished with pg_restore exit $? (non-fatal errors are normal)"
  fi
else
  log "restoring $DUMP -> $TARGET_DB (streamed, no dump file)"
  if gsutil cp "$DUMP" - | docker exec -i "$PG_CONTAINER" pg_restore -U "$PG_USER" -d "$TARGET_DB" --no-owner --no-privileges; then
    log "restore finished cleanly"
  else
    log "restore finished with a non-zero exit (pg_restore exits 1 for ignored errors)"
  fi
  # Rule 3: the exit status is not the test; rows are. Record the dump only
  # when the restore produced users, so a failed one is retried on the next push.
  RESTORED_USERS=$(pg "$TARGET_DB" "select count(*) from users;" 2>/dev/null || echo 0)
  if [ "${RESTORED_USERS:-0}" -gt 0 ] 2>/dev/null; then
    RESTORED_DUMP="$DUMP"   # recorded in the state file only once the scrub has run (rule 9)
    log "restored $RESTORED_USERS users from $DUMP"
  else
    log "WARNING: restore of $DUMP produced no users; it will be tried again on the next push"
  fi
fi

# ── 5. Scrub — nothing on staging identifies a real person (PAD-606) ───────
# staging-scrub.sql (next to this script) rewrites every personal column in ONE transaction, before
# the EXIT trap starts the app. It fails closed: if it does not complete, the schema is wiped, so
# staging comes up empty (its migrations recreate the tables) rather than serving production data,
# and the dump is not recorded, so the next push restores and scrubs again.
SCRUB_SQL="$(dirname "$0")/staging-scrub.sql"
if [ ! -f "$SCRUB_SQL" ]; then
  log "ERROR: $SCRUB_SQL missing; wiping $TARGET_DB rather than serving unscrubbed data"
  pg "$TARGET_DB" "drop schema if exists public cascade; create schema public;" >/dev/null || true
  exit 0
fi
log "scrubbing personal data on $TARGET_DB"
if docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$TARGET_DB" -q -1 -v ON_ERROR_STOP=1 \
     -v pwhash="$PWHASH" -f - < "$SCRUB_SQL" >/dev/null; then
  if [ -n "${RESTORED_DUMP:-}" ]; then
    printf '%s\n' "$RESTORED_DUMP" > "$STATE_FILE" || log "WARNING: could not write $STATE_FILE"
  fi
  log "scrub done: $(pg "$TARGET_DB" "select count(*) from users where email not like '%@staging.invalid';" 2>/dev/null || echo '?') real emails, $(pg "$TARGET_DB" 'select count(*) from device_tokens;' 2>/dev/null || echo '?') device tokens, $(pg "$TARGET_DB" 'select count(*) from push_subscriptions;' 2>/dev/null || echo '?') push subscriptions left"
else
  log "ERROR: the scrub failed; wiping $TARGET_DB rather than serving unscrubbed data"
  pg "$TARGET_DB" "drop schema if exists public cascade; create schema public;" >/dev/null || true
  exit 0
fi
# ── 6. Seed placeholder objects so staging images resolve ────────────────────
# The database is a copy of prod, so every images.object_key names a file that
# lives in the PRODUCTION bucket. Staging deliberately has its own bucket
# (PAD-217), so those keys resolve to nothing: url() signs successfully and the
# fetch then 404s — image serving still cannot be validated here, which is the
# blind spot that let B-018 reach staging unnoticed.
#
# Copying the real objects across is the obvious fix and the wrong one: it would
# spread real users' photos into a second bucket the moment any exist. Instead
# every referenced key gets a tiny generated placeholder, so the whole path
# (sign -> fetch -> render) is exercised without a production byte ever leaving
# its bucket. A visibly blank grey square also stops anyone mistaking staging
# for real data. Keys already present are skipped, so repeat deploys are cheap.
if [ -z "${GCS_UPLOADS_BUCKET:-}" ]; then
  log "no GCS_UPLOADS_BUCKET — skipping placeholder seeding"
  exit 0
fi
# Same shape of guard as step 2: the only way this writes to production is by
# being pointed at it, so refuse the production bucket by name.
case "$GCS_UPLOADS_BUCKET" in
  *-staging) : ;;
  *) skip "refusing to seed non-staging bucket '$GCS_UPLOADS_BUCKET'" ;;
esac
if ! command -v gcloud >/dev/null 2>&1; then
  log "WARNING: gcloud not found — skipping placeholder seeding"
  exit 0
fi

PLACEHOLDER=$(mktemp /tmp/staging-placeholder.XXXXXX.png)
printf '%s' 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAU0lEQVR42u3aMQ0AAAjAMNSiFVlo4CKQzkH/RR4vngDqYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAU4B7fa0G3D1IbtavJn0AAAAASUVORK5CYII=' | base64 -d > "$PLACEHOLDER" 2>/dev/null || true
# base64 flags differ between platforms; a silent failure here would seed the
# bucket with empty files that the skip-if-present check would never replace.
if [ ! -s "$PLACEHOLDER" ]; then
  log "WARNING: placeholder decoded to 0 bytes — skipping seeding"
  rm -f "$PLACEHOLDER"
  exit 0
fi

EXISTING=$(mktemp /tmp/staging-objects.XXXXXX)
gcloud storage ls "gs://$GCS_UPLOADS_BUCKET/**" 2>/dev/null \
  | sed "s#^gs://$GCS_UPLOADS_BUCKET/##" > "$EXISTING" || true

seeded=0
skipped=0
while IFS= read -r key; do
  [ -n "$key" ] || continue
  if grep -qxF "$key" "$EXISTING" 2>/dev/null; then
    skipped=$((skipped + 1))
    continue
  fi
  if gcloud storage cp "$PLACEHOLDER" "gs://$GCS_UPLOADS_BUCKET/$key" >/dev/null 2>&1; then
    seeded=$((seeded + 1))
  else
    log "WARNING: could not seed $key"
  fi
done <<EOF
$(pg "$TARGET_DB" "select distinct object_key from images where object_key is not null;" 2>/dev/null)
EOF

rm -f "$PLACEHOLDER" "$EXISTING"
log "placeholders: $seeded seeded, $skipped already present in $GCS_UPLOADS_BUCKET"

exit 0
