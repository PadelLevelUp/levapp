#!/bin/bash
# =============================================================================
# smoke_image_schema_gate.sh — prove a built API image's migrate step and boot gate (PAD-691)
#
# MANUAL, on a workstation with Docker and a local Postgres; not CI. Run it after any change to
# backend/Dockerfile, scripts/entrypoint.sh, scripts/migrate.sh, padel_app/migrate.py or
# padel_app/schema_state.py (delivery.zero-downtime-deploy rules 9-11). The stub tests replace
# Docker, so only this catches an image-level mistake: the first PAD-691 build gated the migrate
# one-shot itself (ENTRYPOINT runs for it too) and would have failed every deploy.
#
#   docker build -t levapp-smoke:local backend/
#   POSTGRES_PW=... bash backend/scripts/smoke_image_schema_gate.sh levapp-smoke:local
#
# Expects (and exits 1 unless): run 1 migrate on an empty DB exits 0 at head, and again exits 0
# ("already at head"); run 2 the real entrypoint on a DB one revision behind exits 1 before any
# port answers; run 3 an --env-file container at head answers healthz/livez 200, healthz 503
# schema_behind once stamped behind and 200 schema_ahead once stamped ahead.
# Env: POSTGRES_PW (required), PGHOST_LOCAL (localhost), PGPORT_LOCAL (5432),
#      PGHOST_FROM_DOCKER (host.docker.internal), PYTHON (python3 with psycopg2).
# Creates and drops databases smoke_gate_empty / smoke_gate_stale; containers smoke-gate-*.
# =============================================================================
set -uo pipefail
IMG="${1:?usage: smoke_image_schema_gate.sh <image>}"
: "${POSTGRES_PW:?POSTGRES_PW is required}"
PGH="${PGHOST_LOCAL:-localhost}" PGP="${PGPORT_LOCAL:-5432}" DH="${PGHOST_FROM_DOCKER:-host.docker.internal}"
PY="${PYTHON:-python3}"
fail=0
check() { if [ "$2" = "$3" ]; then echo "PASS $1 ($2)"; else echo "FAIL $1: expected $3, got $2"; fail=1; fi; }
sql() { "$PY" - "$@" <<'PYEOF'
import os, sys, psycopg2
c = psycopg2.connect(dbname=sys.argv[1], user=os.getenv("POSTGRES_USER", "padel_app_user"),
                     password=os.environ["POSTGRES_PW"], host=os.environ["PGH"], port=os.environ["PGP"])
c.autocommit = True
cur = c.cursor()
for s in sys.argv[2:]:
    cur.execute(s)
PYEOF
}
export PGH PGP
ENVF=$(umask 077 && mktemp)
cleanup() {
  docker rm -f smoke-gate-migrate smoke-gate-stale smoke-gate-serve >/dev/null 2>&1
  rm -f "$ENVF" "$ENVF.stale"
  sql postgres "drop database if exists smoke_gate_empty" "drop database if exists smoke_gate_stale"
}
trap cleanup EXIT
sql postgres "drop database if exists smoke_gate_empty" "drop database if exists smoke_gate_stale" \
  "create database smoke_gate_empty" "create database smoke_gate_stale"
printf 'FLASK_ENV=development\nPOSTGRES_HOST=%s\nPOSTGRES_PORT=%s\nPOSTGRES_USER=%s\nPOSTGRES_PW=%s\nPOSTGRES_DB=smoke_gate_empty\n' \
  "$DH" "$PGP" "${POSTGRES_USER:-padel_app_user}" "$POSTGRES_PW" > "$ENVF"
sed 's/^POSTGRES_DB=.*/POSTGRES_DB=smoke_gate_stale/' "$ENVF" > "$ENVF.stale"

docker run --rm --name smoke-gate-migrate --env-file "$ENVF" "$IMG" /app/scripts/migrate.sh; check "run 1 migrate empty DB" $? 0
docker run --rm --name smoke-gate-migrate --env-file "$ENVF" "$IMG" /app/scripts/migrate.sh | grep -q "already at head"; check "run 1b already at head" $? 0

read -r HEAD OLDER < <(docker run --rm --entrypoint python "$IMG" -c "
from alembic.script import ScriptDirectory
s = ScriptDirectory('/app/migrations'); h = s.get_current_head(); d = s.get_revision(h).down_revision
print(h, d if isinstance(d, str) else d[0])" 2>/dev/null)
sql smoke_gate_stale "create table alembic_version (version_num varchar(32) not null primary key)" \
  "insert into alembic_version values ('$OLDER')"
PORT=$("$PY" -c "import socket; s = socket.socket(); s.bind(('127.0.0.1', 0)); print(s.getsockname()[1])")
docker run -d --name smoke-gate-stale -p "127.0.0.1:$PORT:80" --env-file "$ENVF.stale" "$IMG" \
  gunicorn --bind 0.0.0.0:80 --workers 1 --threads 4 app:run_app >/dev/null
check "run 2 stale entrypoint exit" "$(docker wait smoke-gate-stale)" 1
docker logs smoke-gate-stale 2>&1 | grep -q "refusing to start: schema behind"; check "run 2 says why" $? 0
docker rm -f smoke-gate-stale >/dev/null

docker run -d --name smoke-gate-serve -p "127.0.0.1:$PORT:80" --env-file "$ENVF" "$IMG" \
  gunicorn --bind 0.0.0.0:80 --workers 1 --threads 4 app:run_app >/dev/null
code() { curl -s -m 3 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT$1"; }
for _ in $(seq 1 60); do [ "$(code /api/app/healthz)" = 200 ] && break; sleep 2; done
check "run 3 healthz at head" "$(code /api/app/healthz)" 200
check "run 3 livez" "$(code /api/app/livez)" 200
sql smoke_gate_empty "update alembic_version set version_num = '$OLDER'"; sleep 11
check "run 3 healthz behind" "$(code /api/app/healthz)" 503
sql smoke_gate_empty "update alembic_version set version_num = 'f0f0f0f0f0f0'"; sleep 11
check "run 3 healthz ahead" "$(code /api/app/healthz)" 200
echo "head $HEAD, older $OLDER"
exit "$fail"
