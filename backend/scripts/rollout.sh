#!/bin/bash
# =============================================================================
# rollout.sh — start the new API container before stopping the old one (PAD-588)
#
# Spec: delivery.zero-downtime-deploy rules 4-7. Runs ON THE VM, scp'd and called
# by deploy-prod.yaml / deploy-staging.yaml with the container's `docker run`
# arguments after `--` (everything except --name and -p; the image last):
#
#   bash rollout.sh --name padelapp --ports 5000,5002 --upstream levapp_api \
#        [--container-port 80] [--health-path /api/app/healthz] [--stop-first] [--migrate] \
#        [--dry-run] -- --restart unless-stopped --network levelup_net ... image:tag
#
# --migrate (PAD-691, rules 4, 7, 9): run /app/scripts/migrate.sh in a one-shot container
# <name>_migrate of the same image and arguments minus --restart (Docker refuses --rm with a
# restart policy, and unless-stopped would re-run it forever), in the foreground so its log is
# in the deploy output. The container no longer migrates itself: its entrypoint refuses to start
# against a schema behind its head (rule 10).
#
# Rolling (the host nginx has `upstream <name>` listing both ports, rule 5):
#   0. --migrate: the migrate step, while the old container keeps serving; failure exits 1 here;
#   1. the live port is the one `docker port <name>` reports (none: first port);
#   2. start <name>_next on the other port;
#   3. poll http://127.0.0.1:<idle>/<health-path> until 200 (HEALTH_TIMEOUT s);
#      on timeout or a restart, print its log, remove it, exit 1 — the old
#      container never stopped, so nothing went down;
#   4. stop the old one (docker stop -t STOP_GRACE), remove it, rename
#      <name>_next to <name> so every other script keeps the stable name.
# Stop-first (--stop-first, or no upstream on the host yet, rule 6): stop the old container
# (kept), migrate (--migrate), run the new one on the first port (the one nginx proxies to when
# there is no upstream), wait for health, then remove the old one. If the migrate step or the new
# container fails, the old one is started again and the deploy exits 1 (rule 7).
# --dry-run: print the plan (mode, ports, migrate) and the docker commands, run nothing.
#
# Env: NGINX_UPSTREAM_CONF (default /etc/nginx/conf.d/levapp-api-upstream.conf),
#      NGINX_SITES_DIR (default /etc/nginx/sites-enabled: a vhost must proxy to the upstream),
#      HEALTH_TIMEOUT (120), STOP_GRACE (10), POLL_SECONDS (1)
# =============================================================================
set -uo pipefail

NAME="" PORTS="" UPSTREAM="" CPORT=80 HEALTH_PATH=/api/app/healthz STOP_FIRST=0 MIGRATE=0 DRY_RUN=0
while [ $# -gt 0 ]; do
  case "$1" in
    --name) NAME="$2"; shift 2 ;;
    --ports) PORTS="$2"; shift 2 ;;
    --upstream) UPSTREAM="$2"; shift 2 ;;
    --container-port) CPORT="$2"; shift 2 ;;
    --health-path) HEALTH_PATH="$2"; shift 2 ;;
    --stop-first) STOP_FIRST=1; shift ;;
    --migrate) MIGRATE=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
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

# --dry-run prints every docker call (on stderr: callers silence stdout) instead of making it; the read-only ones (port, inspect)
# still run so the plan is the real one.
dk() {
  if [ "$DRY_RUN" = 1 ]; then echo "[rollout] dry-run: docker $*" >&2; return 0; fi
  docker "$@"
}

# The one-shot migrate container (rule 9): RUN_ARGS without --restart, image last, then the
# migrate command. Returns migrate.sh's exit code.
run_migrate() {
  local args=() skip=0 a
  for a in "${RUN_ARGS[@]}"; do
    if [ "$skip" = 1 ]; then skip=0; continue; fi
    case "$a" in
      --restart) skip=1 ;;
      --restart=*) ;;
      *) args+=("$a") ;;
    esac
  done
  dk rm -f "${NAME}_migrate" >/dev/null 2>&1 || true
  log "migrate step: one-shot ${NAME}_migrate of ${RUN_ARGS[${#RUN_ARGS[@]}-1]}"
  dk run --rm --name "${NAME}_migrate" "${args[@]}" /app/scripts/migrate.sh
}

# Waits for 200 on the port; fails early when the container restarts (its entrypoint exits
# against a schema behind its head, rule 10, and the restart policy loops it; PAD-220).
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
# B-662: the entries are named on the command line (a glob), not found by recursion.
# sites-enabled holds symlinks into sites-available; GNU grep -r skips a symlink it meets while
# recursing (and BSD grep -R does too), but every grep follows a symlink named as an argument.
elif ! grep -qsE "proxy_pass[[:space:]]+http://${UPSTREAM}[;/]" "$NGINX_SITES_DIR"/*; then
  # The upstream exists but no enabled vhost uses it: nginx still proxies to the first port
  # only, so moving to the second would answer 502.
  rolling=0; log "no enabled vhost in $NGINX_SITES_DIR proxies to $UPSTREAM yet: stop-first (rule 6)"
fi
log "plan: $([ "$rolling" = 1 ] && echo rolling || echo stop-first), ports $PORT_A/$PORT_B, migrate $([ "$MIGRATE" = 1 ] && echo yes || echo no)"

if [ "$rolling" = 0 ]; then
  had_old=0
  docker inspect "$NAME" >/dev/null 2>&1 && had_old=1
  dk rm -f "${NAME}_next" "${NAME}_old" >/dev/null 2>&1 || true
  # Rule 7: stop the old container but keep it until the new one is healthy.
  if [ "$had_old" = 1 ]; then
    dk stop -t "$STOP_GRACE" "$NAME" >/dev/null 2>&1 || true
    dk rename "$NAME" "${NAME}_old" >/dev/null 2>&1 || true
  fi
  restore_old() {
    if [ "$had_old" = 1 ]; then
      dk rm -f "$NAME" >/dev/null 2>&1 || true
      dk rename "${NAME}_old" "$NAME" >/dev/null 2>&1 || true
      dk start "$NAME" >/dev/null 2>&1 && log "old $NAME started again" || log "WARNING: could not start the old $NAME again"
    fi
  }
  if [ "$MIGRATE" = 1 ] && ! run_migrate; then
    restore_old
    die "migrate step failed (stop-first)"
  fi
  if ! dk run -d --name "$NAME" -p "127.0.0.1:${PORT_A}:${CPORT}" "${RUN_ARGS[@]}" >/dev/null; then
    restore_old
    die "docker run $NAME failed"
  fi
  if [ "$DRY_RUN" = 0 ] && ! wait_healthy "$NAME" "$PORT_A"; then
    docker logs --tail 60 "$NAME" 2>&1 || true
    restore_old
    die "$NAME is not healthy"
  fi
  [ "$had_old" = 1 ] && { dk rm "${NAME}_old" >/dev/null 2>&1 || log "WARNING: could not remove ${NAME}_old"; }
  log "done (stop-first) on 127.0.0.1:$PORT_A"
  exit 0
fi

LIVE=$(docker port "$NAME" "$CPORT" 2>/dev/null | head -1 | sed -E 's/.*:([0-9]+)$/\1/')
case "$LIVE" in
  "$PORT_A") IDLE="$PORT_B" ;;
  "$PORT_B") IDLE="$PORT_A" ;;
  *) LIVE=""; IDLE="$PORT_A" ;;
esac
if [ "$MIGRATE" = 1 ]; then
  log "old container ${NAME} serving on ${LIVE:-nothing} during the migrate step (the schema moves under it: rule 12)"
  run_migrate || die "migrate step failed; ${NAME}_next not started, $NAME keeps serving on ${LIVE:-nothing}"
fi
log "live port ${LIVE:-none}; starting ${NAME}_next on $IDLE"

dk rm -f "${NAME}_next" >/dev/null 2>&1 || true
dk run -d --name "${NAME}_next" -p "127.0.0.1:${IDLE}:${CPORT}" "${RUN_ARGS[@]}" >/dev/null \
  || die "docker run ${NAME}_next failed; $NAME keeps serving"
if [ "$DRY_RUN" = 1 ]; then
  dk stop -t "$STOP_GRACE" "$NAME"; dk rm "$NAME"; dk rename "${NAME}_next" "$NAME"
  log "dry-run: done"; exit 0
fi
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
