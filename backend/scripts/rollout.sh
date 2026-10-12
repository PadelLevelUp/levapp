#!/bin/bash
# =============================================================================
# rollout.sh — start the new API container before stopping the old one (PAD-588)
#
# Spec: delivery.zero-downtime-deploy rules 4-7. Runs ON THE VM, scp'd and called
# by deploy-prod.yaml / deploy-staging.yaml with the container's `docker run`
# arguments after `--` (everything except --name and -p; the image last):
#
#   bash rollout.sh --name padelapp --ports 5000,5002 --upstream levapp_api \
#        [--container-port 80] [--health-path /api/app/healthz] [--stop-first] \
#        -- --restart unless-stopped --network levelup_net ... image:tag
#
# Rolling (the host nginx has `upstream <name>` listing both ports, rule 5):
#   1. the live port is the one `docker port <name>` reports (none: first port);
#   2. start <name>_next on the other port; its entrypoint migrates (rule 7);
#   3. poll http://127.0.0.1:<idle>/<health-path> until 200 (HEALTH_TIMEOUT s);
#      on timeout or a restart, print its log, remove it, exit 1 — the old
#      container never stopped, so nothing went down;
#   4. stop the old one (docker stop -t STOP_GRACE), remove it, rename
#      <name>_next to <name> so every other script keeps the stable name.
# Stop-first (--stop-first, or no upstream on the host yet, rule 6): today's
# stop → run → wait for health, on the first port (the one nginx proxies to
# when there is no upstream).
#
# Env: NGINX_UPSTREAM_CONF (default /etc/nginx/conf.d/levapp-api-upstream.conf),
#      NGINX_SITES_DIR (default /etc/nginx/sites-enabled: a vhost must proxy to the upstream),
#      HEALTH_TIMEOUT (120), STOP_GRACE (10), POLL_SECONDS (1)
# =============================================================================
set -uo pipefail

NAME="" PORTS="" UPSTREAM="" CPORT=80 HEALTH_PATH=/api/app/healthz STOP_FIRST=0
while [ $# -gt 0 ]; do
  case "$1" in
    --name) NAME="$2"; shift 2 ;;
    --ports) PORTS="$2"; shift 2 ;;
    --upstream) UPSTREAM="$2"; shift 2 ;;
    --container-port) CPORT="$2"; shift 2 ;;
    --health-path) HEALTH_PATH="$2"; shift 2 ;;
    --stop-first) STOP_FIRST=1; shift ;;
    --) shift; break ;;
    *) echo "[rollout] unknown option $1" >&2; exit 2 ;;
  esac
done
RUN_ARGS=("$@")
UPSTREAM_CONF="${NGINX_UPSTREAM_CONF:-/etc/nginx/conf.d/levapp-api-upstream.conf}"
NGINX_SITES_DIR="${NGINX_SITES_DIR:-/etc/nginx/sites-enabled}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"
STOP_GRACE="${STOP_GRACE:-10}"
POLL_SECONDS="${POLL_SECONDS:-1}"

log() { echo "[rollout] $*"; }
die() { echo "::error::[rollout] $*"; exit 1; }

[ -n "$NAME" ] && [ -n "$PORTS" ] && [ -n "$UPSTREAM" ] || die "--name, --ports and --upstream are required"
[ "${#RUN_ARGS[@]}" -gt 0 ] || die "no docker run arguments after --"
PORT_A="${PORTS%%,*}"; PORT_B="${PORTS##*,}"
[ -n "$PORT_A" ] && [ -n "$PORT_B" ] && [ "$PORT_A" != "$PORT_B" ] || die "--ports must be two different ports, got '$PORTS'"

# Waits for 200 on the port; fails early when the container restarts (a failed migration
# crash-loops it: PAD-220).
wait_healthy() {
  local container="$1" port="$2" waited=0 restarts
  while [ "$waited" -lt "$HEALTH_TIMEOUT" ]; do
    if curl -fsS -m 3 -o /dev/null "http://127.0.0.1:${port}${HEALTH_PATH}" 2>/dev/null; then
      log "$container healthy on 127.0.0.1:$port after ${waited}s"
      return 0
    fi
    restarts=$(docker inspect -f '{{.RestartCount}}' "$container" 2>/dev/null || echo 0)
    if [ "${restarts:-0}" -gt 0 ]; then
      log "$container restarted $restarts time(s) before answering"
      return 1
    fi
    sleep "$POLL_SECONDS"
    waited=$((waited + POLL_SECONDS))
  done
  log "$container did not answer $HEALTH_PATH within ${HEALTH_TIMEOUT}s"
  return 1
}

rolling=1
if [ "$STOP_FIRST" = 1 ]; then
  rolling=0; log "stop-first requested"
elif ! grep -qE "^[[:space:]]*upstream[[:space:]]+${UPSTREAM}[[:space:]]*\{" "$UPSTREAM_CONF" 2>/dev/null; then
  rolling=0; log "no 'upstream $UPSTREAM' in $UPSTREAM_CONF yet: stop-first (rule 6)"
elif ! grep -rqsE "proxy_pass[[:space:]]+http://${UPSTREAM}[;/]" "$NGINX_SITES_DIR"; then
  # The upstream exists but no enabled vhost uses it: nginx still proxies to the first port
  # only, so moving to the second would answer 502.
  rolling=0; log "no enabled vhost in $NGINX_SITES_DIR proxies to $UPSTREAM yet: stop-first (rule 6)"
fi

if [ "$rolling" = 0 ]; then
  docker stop -t "$STOP_GRACE" "$NAME" >/dev/null 2>&1 || true
  docker rm "$NAME" >/dev/null 2>&1 || true
  docker rm -f "${NAME}_next" >/dev/null 2>&1 || true
  docker run -d --name "$NAME" -p "127.0.0.1:${PORT_A}:${CPORT}" "${RUN_ARGS[@]}" >/dev/null \
    || die "docker run $NAME failed"
  if ! wait_healthy "$NAME" "$PORT_A"; then
    docker logs --tail 60 "$NAME" 2>&1 || true
    die "$NAME is not healthy"
  fi
  log "done (stop-first) on 127.0.0.1:$PORT_A"
  exit 0
fi

LIVE=$(docker port "$NAME" "$CPORT" 2>/dev/null | head -1 | sed -E 's/.*:([0-9]+)$/\1/')
case "$LIVE" in
  "$PORT_A") IDLE="$PORT_B" ;;
  "$PORT_B") IDLE="$PORT_A" ;;
  *) LIVE=""; IDLE="$PORT_A" ;;
esac
log "live port ${LIVE:-none}; starting ${NAME}_next on $IDLE"

docker rm -f "${NAME}_next" >/dev/null 2>&1 || true
docker run -d --name "${NAME}_next" -p "127.0.0.1:${IDLE}:${CPORT}" "${RUN_ARGS[@]}" >/dev/null \
  || die "docker run ${NAME}_next failed; $NAME keeps serving"
if ! wait_healthy "${NAME}_next" "$IDLE"; then
  docker logs --tail 60 "${NAME}_next" 2>&1 || true
  docker rm -f "${NAME}_next" >/dev/null 2>&1 || true
  die "${NAME}_next is not healthy; $NAME keeps serving on ${LIVE:-nothing}"
fi

if [ -n "$LIVE" ] || docker inspect "$NAME" >/dev/null 2>&1; then
  docker stop -t "$STOP_GRACE" "$NAME" >/dev/null 2>&1 || log "WARNING: could not stop $NAME"
  docker rm "$NAME" >/dev/null 2>&1 || log "WARNING: could not remove $NAME"
fi
docker rename "${NAME}_next" "$NAME" || die "could not rename ${NAME}_next to $NAME"
log "done: $NAME serves on 127.0.0.1:$IDLE"
