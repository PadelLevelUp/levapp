#!/bin/bash
# =============================================================================
# smoke_worker_split.sh — prove a built image's worker role against a real Postgres (PAD-695)
#
# MANUAL, on a workstation with Docker and a local Postgres; not CI. Run it after any change to
# padel_app/worker.py, the scheduler's modes (padel_app/scheduler.py) or the realtime broker
# (delivery.worker-role). The unit tests fake the scheduler and the lock; only this shows an API
# and a worker container splitting the jobs over one database.
#
#   docker build -t levapp-smoke:local backend/
#   POSTGRES_PW=... bash backend/scripts/smoke_worker_split.sh levapp-smoke:local
#
# With WORKER_SPLIT=on and SSE_BROKER=postgres, an API (gunicorn) and a worker (--memory 256m):
#   1. the worker leads (livez) and the API's scheduler is a paused client;
#   2. a job armed from an API-role process 20 s ahead (realtime.publish to a user) fires once,
#      and its event reaches a stream that user holds on the API;
#   3. with the worker stopped a due job does not fire; started again, it fires (within its grace);
#   4. the worker's memory stays under its limit (reported).
# Exits 1 unless every check passes. Env: as smoke_image_schema_gate.sh.
# Creates and drops database smoke_worker; containers smoke-worker-*.
# =============================================================================
set -uo pipefail
IMG="${1:?usage: smoke_worker_split.sh <image>}"
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
    if cur.description:
        print(cur.fetchone()[0])
PYEOF
}
export PGH PGP
ENVF=$(umask 077 && mktemp)
STREAM=$(mktemp)
cleanup() {
  [ -n "${CURL_PID:-}" ] && kill "$CURL_PID" 2>/dev/null
  docker rm -f smoke-worker-migrate smoke-worker-api smoke-worker-worker >/dev/null 2>&1
  rm -f "$ENVF" "$STREAM"
  sql postgres "drop database if exists smoke_worker" >/dev/null
}
trap cleanup EXIT
sql postgres "drop database if exists smoke_worker" "create database smoke_worker" >/dev/null
printf 'FLASK_ENV=development\nPOSTGRES_HOST=%s\nPOSTGRES_PORT=%s\nPOSTGRES_USER=%s\nPOSTGRES_PW=%s\nPOSTGRES_DB=smoke_worker\nJWT_SECRET_KEY=smoke-worker-secret\nWORKER_SPLIT=on\nSSE_BROKER=postgres\n' \
  "$DH" "$PGP" "${POSTGRES_USER:-padel_app_user}" "$POSTGRES_PW" > "$ENVF"

docker run --rm --name smoke-worker-migrate --env-file "$ENVF" "$IMG" /app/scripts/migrate.sh >/dev/null
check "migrate" $? 0

PORT=$("$PY" -c "import socket; s = socket.socket(); s.bind(('127.0.0.1', 0)); print(s.getsockname()[1])")
docker run -d --name smoke-worker-api -p "127.0.0.1:$PORT:80" --env-file "$ENVF" "$IMG" \
  gunicorn --bind 0.0.0.0:80 --workers 1 --threads 8 app:run_app >/dev/null
docker run -d --name smoke-worker-worker --memory 256m --env-file "$ENVF" -e ROLE=worker "$IMG" \
  python -m padel_app.worker >/dev/null
code() { curl -s -m 3 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT$1"; }
livez() { docker exec smoke-worker-worker python -c "import json,urllib.request; print(json.load(urllib.request.urlopen('http://127.0.0.1:8081/livez', timeout=3))['leader'])" 2>/dev/null; }
for _ in $(seq 1 60); do [ "$(code /api/app/healthz)" = 200 ] && [ "$(livez)" = True ] && break; sleep 2; done
check "1 api healthz" "$(code /api/app/healthz)" 200
check "1 worker leads" "$(livez)" True

# In an API-role process: a user, a token, and the API's scheduler mode.
read -r UID_ TOKEN MODE < <(docker exec smoke-worker-api python -c "
from padel_app import create_app
from padel_app.sql_db import db
from padel_app.models import User
from flask_jwt_extended import create_access_token
app = create_app()
with app.app_context():
    u = User(name='Smoke Worker', username='smoke_worker', password='x', status='active')
    db.session.add(u); db.session.commit()
    s = app.extensions['scheduler']
    print(u.id, create_access_token(identity=str(u.id)), 'paused' if s.state == 2 else s.state)
" 2>/dev/null | tail -1)
check "1 api scheduler is a paused client" "$MODE" paused

arm() {  # arm <job id> <seconds ahead> <marker>: realtime.publish to the user, from an API process
  docker exec smoke-worker-api python -c "
from datetime import datetime, timedelta, timezone
from padel_app import create_app
app = create_app()
app.extensions['scheduler'].add_job('padel_app.realtime:publish', 'date', id='$1',
    run_date=datetime.now(timezone.utc) + timedelta(seconds=$2), misfire_grace_time=300,
    args=[{'type': 'smoke', 'marker': '$3'}, [$UID_]])
" >/dev/null 2>&1
}
rows() { sql smoke_worker "select count(*) from realtime_events where body like '%\"marker\": \"$1\"%'"; }

curl -sN -m 120 "http://127.0.0.1:$PORT/api/app/events?token=$TOKEN" > "$STREAM" 2>/dev/null &
CURL_PID=$!
sleep 3
arm smoke_one 20 one
sleep 32
check "2 the job fired once" "$(rows one)" 1
check "2 its event reached the API stream" "$(grep -c '"marker": "one"' "$STREAM")" 1

docker stop -t 60 smoke-worker-worker >/dev/null
arm smoke_two 10 two
sleep 20
check "3 nothing fires while the worker is stopped" "$(rows two)" 0
docker start smoke-worker-worker >/dev/null
for _ in $(seq 1 30); do [ "$(rows two)" = 1 ] && break; sleep 2; done
check "3 it fires after the worker restarts" "$(rows two)" 1

echo "worker memory: $(docker stats --no-stream --format '{{.MemUsage}}' smoke-worker-worker)"
echo "api memory:    $(docker stats --no-stream --format '{{.MemUsage}}' smoke-worker-api)"
check "4 the worker was never OOM-killed" "$(docker inspect -f '{{.State.OOMKilled}}' smoke-worker-worker)" false
docker logs smoke-worker-worker 2>&1 | grep -E "^\[worker\]" | tail -5
exit "$fail"
