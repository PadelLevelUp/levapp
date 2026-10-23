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
#        [--probe-host staging.levapp.app] [--drain] [--dry-run] -- --restart unless-stopped ... image:tag
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
#   3b. (B-664) keep the old one serving for the idle port's nginx fail_timeout + 1 s, read from
#      the upstream conf (nginx's default 10 s when absent): a request nginx proxied to the idle
#      port while it booted failed and marked it down for fail_timeout, and stopping the old one
#      inside that window leaves nginx no live upstream (502 for every method). The wait counts
#      from "healthy", the last moment such a failure can happen. Then, with --probe-host, one
#      request through nginx (https://<host><health-path>, resolved to 127.0.0.1) must answer
#      below 500 within PROBE_TRIES tries, or the new one is removed and the old keeps serving;
#   4. stop the old one (docker stop -t STOP_GRACE), remove it, rename
#      <name>_next to <name> so every other script keeps the stable name.
# --drain (PAD-714, rule 16, B-663): docker-proxy accepts on a published port before gunicorn
#   listens and after it stops listening, then resets the request; nginx retries that for a GET,
#   never for a POST. With --drain, rolling mode takes a port out of nginx's rotation (`down` in the
#   upstream, reload) before a container boots or stops on it: after the migrate step the idle port
#   goes down (before the second copy stops on it and <name>_next boots on it); once healthy it goes
#   up, and step 3b's wait is skipped (no boot-time request could mark it); after the probe through
#   nginx, with both ports up, the old port goes down, then stops; it comes back up when nothing will
#   boot on it (with --copies 2, once <name>_b is healthy there). Each reload is followed by
#   RELOAD_SETTLE s: `nginx -s reload` returns before the new workers serve. No port is left down
#   when the script exits, on any path (a rollback's older rollout.sh knows nothing of `down`).
#   The edit goes through NGINX_DRAIN_CMD, the root-owned helper infra/nginx/levapp-upstream-port
#   via `sudo -n`; when its --check fails (the owner's host step not done) the run logs one line and
#   swaps exactly as without --drain.
# Stop-first (--stop-first, or no upstream on the host yet, rule 6): stop the old container
# (kept), migrate (--migrate), run the new one on the first port (the one nginx proxies to when
# there is no upstream), wait for health, then remove the old one. If the migrate step or the new
# container fails, the old one is started again and the deploy exits 1 (rule 7).
# --dry-run: print the plan (mode, ports, migrate) and the docker commands, run nothing.
# --copies 1|2 (PAD-704, rule 14): with 2, after the swap (and the worker), start <name>_b of the same
# image and arguments on the port the old copy freed and wait for its health, so both loopback
# ports of the upstream serve. A <name>_b from the last deploy holds the idle port, so it is
# stopped and removed first (after the migrate step; each deploy has a one-copy moment). With 1 (the
# default) a leftover <name>_b is removed and nothing replaces it. Stop-first never runs a second
# copy. A second copy that does not answer is removed and the run is red; the first copy serves.
# --worker (PAD-695, rule 13; delivery.worker-role): after the API swap, in both modes, start
# <name>_worker_next from the same arguments with --memory WORKER_MEMORY, -e ROLE=worker (it
# overrides --env-file whatever the order; ROLE is never in the env templates) and the command
# `python -m padel_app.worker`, no published port. Once its /livez answers (docker exec: the image
# has no curl), stop the old <name>_worker (-t WORKER_STOP_GRACE: running jobs finish), rename,
# and require livez "leader": true within WORKER_LEAD_TIMEOUT s: with WORKER_SPLIT on the API never
# competes, so a worker that never leads means no job runs anywhere. An unhealthy new worker is
# removed and the old one keeps leading (exit 1); one that does not lead is left running, since it
# may still take over (exit 1). Without --worker, a leftover <name>_worker is stopped and removed
# (the flag went off: the API competes again).
#
# Env: NGINX_UPSTREAM_CONF (default /etc/nginx/conf.d/levapp-api-upstream.conf),
#      NGINX_SITES_DIR (default /etc/nginx/sites-enabled: a vhost must proxy to the upstream),
#      HEALTH_TIMEOUT (120), STOP_GRACE (10), POLL_SECONDS (1), PROBE_TRIES (10), WORKER_MEMORY (256m),
#      WORKER_HEALTH_TIMEOUT (60), WORKER_STOP_GRACE (60), WORKER_LEAD_TIMEOUT (30),
#      WORKER_LIVEZ_PORT (8081), NGINX_DRAIN_CMD (sudo -n /usr/local/sbin/levapp-upstream-port),
#      RELOAD_SETTLE (2)
# =============================================================================
set -uo pipefail

NAME="" PORTS="" UPSTREAM="" CPORT=80 HEALTH_PATH=/api/app/healthz STOP_FIRST=0 MIGRATE=0 DRY_RUN=0 PROBE_HOST="" WORKER=0 COPIES=1 DRAIN=0
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
    --probe-host) PROBE_HOST="$2"; shift 2 ;;
    --worker) WORKER=1; shift ;;
    --copies) COPIES="$2"; shift 2 ;;
    --drain) DRAIN=1; shift ;;
    --) shift; break ;;
    *) echo "[rollout] unknown option $1" >&2; exit 2 ;;
  esac
done
RUN_ARGS=("$@")
case "$COPIES" in 1|2) ;; *) echo "[rollout] --copies must be 1 or 2, got '$COPIES'" >&2; exit 2 ;; esac
UPSTREAM_CONF="${NGINX_UPSTREAM_CONF:-/etc/nginx/conf.d/levapp-api-upstream.conf}"
NGINX_SITES_DIR="${NGINX_SITES_DIR:-/etc/nginx/sites-enabled}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"
STOP_GRACE="${STOP_GRACE:-10}"
POLL_SECONDS="${POLL_SECONDS:-1}"
PROBE_TRIES="${PROBE_TRIES:-10}"
WORKER_MEMORY="${WORKER_MEMORY:-256m}"
WORKER_HEALTH_TIMEOUT="${WORKER_HEALTH_TIMEOUT:-60}"
WORKER_STOP_GRACE="${WORKER_STOP_GRACE:-60}"
WORKER_LEAD_TIMEOUT="${WORKER_LEAD_TIMEOUT:-30}"
WORKER_LIVEZ_PORT="${WORKER_LIVEZ_PORT:-8081}"
read -ra DRAIN_CMD <<< "${NGINX_DRAIN_CMD:-sudo -n /usr/local/sbin/levapp-upstream-port}"
RELOAD_SETTLE="${RELOAD_SETTLE:-2}"

log() { echo "[rollout] $*"; }
die() { echo "::error::[rollout] $*"; exit 1; }

[ -n "$NAME" ] && [ -n "$PORTS" ] && [ -n "$UPSTREAM" ] || die "--name, --ports and --upstream are required"
[ "${#RUN_ARGS[@]}" -gt 0 ] || die "no docker run arguments after --"
PORT_A="${PORTS%%,*}"; PORT_B="${PORTS##*,}"
[ -n "$PORT_A" ] && [ -n "$PORT_B" ] && [ "$PORT_A" != "$PORT_B" ] || die "--ports must be two different ports, got '$PORTS'"

# --dry-run prints every docker call instead of making it, on fd 3 (the script's own stderr, so
# the callers' `>/dev/null 2>&1` cannot swallow it); the read-only calls (port, inspect) still run
# so the plan is the real one.
exec 3>&2
dk() {
  if [ "$DRY_RUN" = 1 ]; then echo "[rollout] dry-run: docker $*" >&3; return 0; fi
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
  # A migrate container from an earlier run whose ssh session dropped may still be migrating:
  # wait for it rather than kill it mid-way (this run then finds the schema at head).
  if [ "$(docker inspect -f '{{.State.Running}}' "${NAME}_migrate" 2>/dev/null)" = true ]; then
    log "a migrate step from an earlier run is still running: waiting for it to finish"
    dk wait "${NAME}_migrate" >/dev/null 2>&1 || true
  fi
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

# B-664: the port's fail_timeout in whole seconds, from its `server 127.0.0.1:<port> ...` line in
# the upstream conf; nginx's default (10 s) when the line or the parameter is missing.
fail_timeout() {
  local v
  v=$(grep -E "^[[:space:]]*server[[:space:]]+127\.0\.0\.1:$1[[:space:];]" "$UPSTREAM_CONF" 2>/dev/null \
      | sed -nE 's/.*fail_timeout=([0-9]+(ms|s|m)?).*/\1/p' | head -1)
  case "$v" in
    "") echo 10 ;;
    *ms) echo 1 ;;
    *m) echo $(( ${v%m} * 60 )) ;;
    *s) echo "${v%s}" ;;
    *) echo "$v" ;;
  esac
}

# B-664: one request through nginx to the vhost; true when it answers below 500.
through_nginx() {
  local code
  code=$(curl -sS -o /dev/null -w '%{http_code}' -m 5 --resolve "${PROBE_HOST}:443:127.0.0.1" \
    "https://${PROBE_HOST}${HEALTH_PATH}" 2>/dev/null)
  [ -n "$code" ] && [ "$code" != 000 ] && [ "$code" -lt 500 ] 2>/dev/null
}

# PAD-714 (--drain): set ports up or down in $UPSTREAM and reload nginx; a no-op unless the drain is
# on for this run. `downs` lists the ports this run left down, for restore_ports.
drained=0 downs=" "
ports_set() {  # ports_set <port>=up|down ...
  [ "$drained" = 1 ] || return 0
  if [ "$DRY_RUN" = 1 ]; then echo "[rollout] dry-run: ${DRAIN_CMD[*]} $UPSTREAM_CONF $UPSTREAM $*" >&3; return 0; fi
  "${DRAIN_CMD[@]}" "$UPSTREAM_CONF" "$UPSTREAM" "$@" || return 1
  local s p
  for s in "$@"; do
    p="${s%=*}"; downs="${downs// $p / }"
    [ "${s#*=}" = down ] && downs="${downs}${p} "
  done
  log "nginx: $* in $UPSTREAM"
  sleep "$RELOAD_SETTLE"
}

# On every exit, a port this run took down comes back up (rule 16).
restore_ports() {
  local p specs=()
  for p in $downs; do specs+=("$p=up"); done
  [ "${#specs[@]}" -gt 0 ] || return 0
  ports_set "${specs[@]}" || echo "::error::[rollout] could not put ${specs[*]} back in $UPSTREAM; fix by hand: ${DRAIN_CMD[*]} $UPSTREAM_CONF $UPSTREAM ${specs[*]}"
}

# The worker's /livez as one word: leader, standby, or nothing when it does not answer.
worker_state() {
  docker exec "$1" python -c "import json,urllib.request; d=json.load(urllib.request.urlopen('http://127.0.0.1:${WORKER_LIVEZ_PORT}/livez', timeout=3)); print('leader' if d.get('leader') else 'standby')" 2>/dev/null
}

# PAD-695: the worker container, after the API swap (see --worker above).
deploy_worker() {
  local w="${NAME}_worker" n="${#RUN_ARGS[@]}" waited=0 state restarts
  if [ "$WORKER" = 0 ]; then
    if docker inspect "$w" >/dev/null 2>&1; then
      log "no --worker: stopping and removing $w (WORKER_SPLIT off, the API runs the jobs)"
      dk stop -t "$WORKER_STOP_GRACE" "$w" >/dev/null 2>&1 || true
      dk rm "$w" >/dev/null 2>&1 || log "WARNING: could not remove $w"
    fi
    return 0
  fi
  local image="${RUN_ARGS[$((n - 1))]}" opts=("${RUN_ARGS[@]:0:$((n - 1))}")
  log "worker: starting ${w}_next of $image"
  dk rm -f "${w}_next" >/dev/null 2>&1 || true
  dk run -d --name "${w}_next" "${opts[@]}" --memory "$WORKER_MEMORY" -e ROLE=worker \
    -e WORKER_LIVEZ_PORT="$WORKER_LIVEZ_PORT" "$image" python -m padel_app.worker >/dev/null \
    || die "docker run ${w}_next failed; $w keeps leading"
  if [ "$DRY_RUN" = 1 ]; then
    dk stop -t "$WORKER_STOP_GRACE" "$w"; dk rm "$w"; dk rename "${w}_next" "$w"
    return 0
  fi
  while :; do
    state=$(worker_state "${w}_next")
    if [ -n "$state" ]; then log "worker: ${w}_next alive after ${waited}s ($state)"; break; fi
    restarts=$(docker inspect -f '{{.RestartCount}}' "${w}_next" 2>/dev/null || echo 0)
    if [ "${restarts:-0}" -gt 0 ] || [ "$waited" -ge "$WORKER_HEALTH_TIMEOUT" ]; then
      docker logs --tail 60 "${w}_next" 2>&1 || true
      docker rm -f "${w}_next" >/dev/null 2>&1 || true
      die "worker ${w}_next did not answer /livez (restarts ${restarts:-0}, ${waited}s); $w keeps leading"
    fi
    sleep "$POLL_SECONDS"; waited=$((waited + POLL_SECONDS))
  done
  if docker inspect "$w" >/dev/null 2>&1; then
    docker stop -t "$WORKER_STOP_GRACE" "$w" >/dev/null 2>&1 || log "WARNING: could not stop $w"
    docker rm "$w" >/dev/null 2>&1 || log "WARNING: could not remove $w"
  fi
  docker rename "${w}_next" "$w" || die "could not rename ${w}_next to $w"
  waited=0
  while [ "$waited" -le "$WORKER_LEAD_TIMEOUT" ]; do
    if [ "$(worker_state "$w")" = leader ]; then
      log "worker: $w leads the scheduler after ${waited}s"
      return 0
    fi
    sleep "$POLL_SECONDS"; waited=$((waited + POLL_SECONDS))
  done
  docker logs --tail 30 "$w" 2>&1 || true
  die "worker $w is not the scheduler leader after ${WORKER_LEAD_TIMEOUT}s: no job runs until it is (left running; it may still take over)"
}

# PAD-704: the second copy holds a port; it goes before the swap, and (with --copies 2) comes back after.
remove_second_copy() {
  if docker inspect "${NAME}_b" >/dev/null 2>&1; then
    log "stopping ${NAME}_b (the second copy) to free its port"
    dk stop -t "$STOP_GRACE" "${NAME}_b" >/dev/null 2>&1 || true
    dk rm "${NAME}_b" >/dev/null 2>&1 || log "WARNING: could not remove ${NAME}_b"
  fi
}

start_second_copy() {  # start_second_copy <port>
  [ "$COPIES" = 2 ] || return 0
  log "second copy: starting ${NAME}_b on 127.0.0.1:$1"
  dk rm -f "${NAME}_b" >/dev/null 2>&1 || true
  dk run -d --name "${NAME}_b" -p "127.0.0.1:$1:${CPORT}" "${RUN_ARGS[@]}" >/dev/null \
    || die "docker run ${NAME}_b failed; $NAME serves alone on its port"
  [ "$DRY_RUN" = 1 ] && { ports_set "$1=up"; return 0; }
  if ! wait_healthy "${NAME}_b" "$1"; then
    docker logs --tail 60 "${NAME}_b" 2>&1 || true
    docker rm -f "${NAME}_b" >/dev/null 2>&1 || true
    die "${NAME}_b is not healthy; removed, $NAME serves alone"
  fi
  ports_set "$1=up" || die "could not put $1 back in $UPSTREAM; $NAME serves alone"
  log "second copy: ${NAME}_b serves on 127.0.0.1:$1"
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
log "plan: $([ "$rolling" = 1 ] && echo rolling || echo stop-first), ports $PORT_A/$PORT_B, migrate $([ "$MIGRATE" = 1 ] && echo yes || echo no), worker $([ "$WORKER" = 1 ] && echo yes || echo no), copies $COPIES"

# Stop-first keeps the old container as <name>_old until the new one is healthy (rule 7).
had_old=0
restore_old() {
  [ "$had_old" = 1 ] || return 0
  dk rm -f "$NAME" >/dev/null 2>&1 || true
  dk rename "${NAME}_old" "$NAME" >/dev/null 2>&1 || true
  if dk start "$NAME" >/dev/null 2>&1; then log "old $NAME started again"
  else log "WARNING: could not start the old $NAME again"; fi
}

if [ "$rolling" = 0 ]; then
  # A second copy needs the rolling upstream; stop-first never runs one, and never leaves one serving
  # the old release.
  [ "$COPIES" = 2 ] && log "stop-first: no second copy this run (it needs the rolling upstream)"
  remove_second_copy
  dk rm -f "${NAME}_next" >/dev/null 2>&1 || true
  if docker inspect "$NAME" >/dev/null 2>&1; then
    had_old=1
    dk rm -f "${NAME}_old" >/dev/null 2>&1 || true
    dk stop -t "$STOP_GRACE" "$NAME" >/dev/null 2>&1 || true
    dk rename "$NAME" "${NAME}_old" >/dev/null 2>&1 || true
  elif docker inspect "${NAME}_old" >/dev/null 2>&1; then
    # An earlier stop-first run died between the rename and the swap: its <name>_old is the
    # only release that ever served, so it is the one to restore, never a leftover to delete.
    had_old=1
    log "found ${NAME}_old from an interrupted run: keeping it as the old container"
  fi
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
  if [ "$had_old" = 1 ]; then
    dk rm "${NAME}_old" >/dev/null 2>&1 || log "WARNING: could not remove ${NAME}_old"
  fi
  log "done (stop-first) on 127.0.0.1:$PORT_A"
  deploy_worker
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
# PAD-714 (rule 16): from here the idle port leaves nginx's rotation before anything stops or boots
# on it. Both ports are named, so a `down` a killed earlier run left behind is cleared too.
if [ "$DRAIN" = 1 ]; then
  if [ -z "$LIVE" ]; then
    log "drain: no live container, nothing to drain"
  elif "${DRAIN_CMD[@]}" --check >/dev/null 2>&1; then
    drained=1
    trap restore_ports EXIT
    trap 'exit 1' HUP INT TERM
    if ! ports_set "$IDLE=down" "$LIVE=up"; then
      drained=0
      log "drain: could not take $IDLE out of $UPSTREAM: swapping without the drain (B-663)"
    fi
  else
    log "drain: ${DRAIN_CMD[*]} is not available to $(id -un): swapping without the drain, as before (B-663)"
  fi
fi
# PAD-704: both copies served through the migrate step; the second one now gives back its port.
if docker inspect "${NAME}_b" >/dev/null 2>&1; then
  remove_second_copy
  LIVE=$(docker port "$NAME" "$CPORT" 2>/dev/null | head -1 | sed -E 's/.*:([0-9]+)$/\1/')
  case "$LIVE" in
    "$PORT_A") IDLE="$PORT_B" ;;
    "$PORT_B") IDLE="$PORT_A" ;;
    *) LIVE=""; IDLE="$PORT_A" ;;
  esac
fi
log "live port ${LIVE:-none}; starting ${NAME}_next on $IDLE"

dk rm -f "${NAME}_next" >/dev/null 2>&1 || true
dk run -d --name "${NAME}_next" -p "127.0.0.1:${IDLE}:${CPORT}" "${RUN_ARGS[@]}" >/dev/null \
  || die "docker run ${NAME}_next failed; $NAME keeps serving"
if [ "$DRY_RUN" = 1 ]; then
  ports_set "$IDLE=up"; ports_set "$LIVE=down"
  dk stop -t "$STOP_GRACE" "$NAME"; dk rm "$NAME"; dk rename "${NAME}_next" "$NAME"
  [ "$COPIES" = 2 ] || ports_set "$LIVE=up"
  deploy_worker; start_second_copy "$([ "$IDLE" = "$PORT_A" ] && echo "$PORT_B" || echo "$PORT_A")"
  log "dry-run: done"; exit 0
fi
if ! wait_healthy "${NAME}_next" "$IDLE"; then
  docker logs --tail 60 "${NAME}_next" 2>&1 || true
  docker rm -f "${NAME}_next" >/dev/null 2>&1 || true
  die "${NAME}_next is not healthy; $NAME keeps serving on ${LIVE:-nothing}"
fi

if [ "$drained" = 1 ]; then
  if ! ports_set "$IDLE=up"; then
    docker rm -f "${NAME}_next" >/dev/null 2>&1 || true
    die "could not put $IDLE in $UPSTREAM; ${NAME}_next removed, $NAME keeps serving"
  fi
  log "drain: $IDLE took no request while it booted, so no fail_timeout wait (B-664)"
else
  settle=$(( $(fail_timeout "$IDLE") + 1 ))
  log "keeping $NAME serving ${settle}s more: nginx may have marked $IDLE down while it booted (fail_timeout + 1 s, B-664)"
  sleep "$settle"
fi
if [ -n "$PROBE_HOST" ]; then
  tries=0
  until through_nginx; do
    tries=$((tries + 1))
    if [ "$tries" -ge "$PROBE_TRIES" ]; then
      ports_set "$IDLE=down" || true
      docker rm -f "${NAME}_next" >/dev/null 2>&1 || true
      die "https://${PROBE_HOST}${HEALTH_PATH} through nginx did not answer below 500 in $tries tries; ${NAME}_next removed, $NAME keeps serving"
    fi
    sleep "$POLL_SECONDS"
  done
  log "through nginx: https://${PROBE_HOST}${HEALTH_PATH} answers"
else
  log "no --probe-host: skipping the request through nginx"
fi

if [ -n "$LIVE" ] || docker inspect "$NAME" >/dev/null 2>&1; then
  if [ "$drained" = 1 ] && ! ports_set "$LIVE=down"; then
    log "WARNING: drain: could not take $LIVE out of $UPSTREAM: stopping it in rotation, as before (B-663)"
  fi
  docker stop -t "$STOP_GRACE" "$NAME" >/dev/null 2>&1 || log "WARNING: could not stop $NAME"
  docker rm "$NAME" >/dev/null 2>&1 || log "WARNING: could not remove $NAME"
fi
docker rename "${NAME}_next" "$NAME" || die "could not rename ${NAME}_next to $NAME"
# With --copies 2 the freed port stays down until <name>_b is healthy on it (start_second_copy).
if [ "$drained" = 1 ] && [ "$COPIES" != 2 ]; then
  ports_set "$LIVE=up" || log "WARNING: drain: could not put $LIVE back in $UPSTREAM"
fi
log "done: $NAME serves on 127.0.0.1:$IDLE"
deploy_worker
start_second_copy "$([ "$IDLE" = "$PORT_A" ] && echo "$PORT_B" || echo "$PORT_A")"
