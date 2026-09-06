#!/bin/bash
# =============================================================================
# sync-staging-db.sh — refresh the STAGING database from PRODUCTION (PAD-200)
#
# Runs ON THE VM (levelup-instance), invoked by deploy-staging.yaml after the
# staging backend container is up. Copies `padel_app` (prod) into
# `padel_app_staging` as a full replace, then restarts the staging app so its
# entrypoint runs `flask db upgrade` and the copied schema matches staging's
# code (staging can carry migrations prod does not have yet).
#
# Contract (ticket PAD-200):
#   * every staging deploy, not a schedule;
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
#     restore, so `--clean` can drop objects.
#
# Usage:  bash sync-staging-db.sh [/path/to/.env.staging]
# Env overrides: APP_CONTAINER, PG_CONTAINER, SOURCE_DB, MIN_FREE_MB,
#                HEALTH_URL, EXPECTED_TARGET_DB
# =============================================================================
set -uo pipefail

ENV_FILE="${1:-$HOME/.env.staging}"
APP_CONTAINER="${APP_CONTAINER:-padelapp_staging}"
PG_CONTAINER="${PG_CONTAINER:-postgres}"
SOURCE_DB="${SOURCE_DB:-padel_app}"
EXPECTED_TARGET_DB="${EXPECTED_TARGET_DB:-padel_app_staging}"
MIN_FREE_MB="${MIN_FREE_MB:-1024}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:5100/api/app/healthz}"

log() { echo "[sync-staging-db] $*"; }
skip() { log "SKIPPED: $*"; exit 0; }

# ── 1. Read the staging DB identity from .env.staging (KEY=VALUE lines only) ──
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

SOURCE_USERS=$(pg "$SOURCE_DB" "select count(*) from users;" 2>/dev/null || echo "?")
log "source $SOURCE_DB has $SOURCE_USERS users; target $TARGET_DB; ${FREE_MB} MB free"

# ── 3. Stop the staging app; ALWAYS start it again, whatever happens below ──
restart_app() {
  log "starting $APP_CONTAINER (its entrypoint runs flask db upgrade)"
  docker start "$APP_CONTAINER" >/dev/null 2>&1 || log "WARNING: could not start $APP_CONTAINER"
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
trap restart_app EXIT

docker stop "$APP_CONTAINER" >/dev/null 2>&1 || log "WARNING: could not stop $APP_CONTAINER"
pg postgres "select pg_terminate_backend(pid) from pg_stat_activity where datname = '$TARGET_DB' and pid <> pg_backend_pid();" >/dev/null 2>&1 || true

# ── 4. Copy: prod dump streamed into a clean restore of the target ───────────
# pg_restore exits 1 for non-fatal "errors ignored" (e.g. a DROP on an object
# that was never there); the restore itself has still completed. Log and go on.
log "copying $SOURCE_DB -> $TARGET_DB (streamed, no dump file)"
if docker exec "$PG_CONTAINER" sh -c \
  "pg_dump -U '$PG_USER' -Fc '$SOURCE_DB' | pg_restore -U '$PG_USER' -d '$TARGET_DB' --clean --if-exists --no-owner --no-privileges"; then
  log "copy finished cleanly"
else
  log "copy finished with pg_restore exit $? (non-fatal errors are normal with --clean)"
fi

# ── 5. Safety scrub — nothing on staging may ever reach a real person ────────
# Staging carries no push / mail credentials today; this makes that permanent.
# If someone later adds VAPID / Expo / mail secrets to staging, there is no
# token to push to and no deliverable address to mail. Usernames, passwords,
# names, phones, classes and messages are left intact on purpose: they are what
# makes testing on staging meaningful, and no automated channel uses them.
log "scrubbing outbound channels on $TARGET_DB"
pg "$TARGET_DB" "delete from push_subscriptions;" >/dev/null \
  || log "WARNING: could not clear push_subscriptions"
pg "$TARGET_DB" "delete from device_tokens;" >/dev/null \
  || log "WARNING: could not clear device_tokens"
pg "$TARGET_DB" "update users set email = 'user' || id || '@staging.invalid' where email is not null;" >/dev/null \
  || log "WARNING: could not rewrite emails"
log "scrub done: $(pg "$TARGET_DB" 'select count(*) from push_subscriptions;' 2>/dev/null || echo '?') push subscriptions, $(pg "$TARGET_DB" 'select count(*) from device_tokens;' 2>/dev/null || echo '?') device tokens, $(pg "$TARGET_DB" "select count(*) from users where email not like '%@staging.invalid';" 2>/dev/null || echo '?') real emails left"
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
