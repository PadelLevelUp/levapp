#!/bin/bash
# =============================================================================
# migrate-job.sh — run the migrate Job and stop on its outcome (PAD-703, delivery.k8s-manifests rule 5)
#
#   bash infra/k8s/migrate-job.sh <namespace> <rendered-migrate.yaml>
#
#   1. A Job `migrate` that is still running (a slow backfill, PAD-718) is never deleted: wait for
#      it, up to ACTIVE_WAIT seconds (1500), else exit 1.
#   2. Delete the finished one, apply the new one.
#   3. Poll .status.conditions every POLL seconds (5) for Complete or Failed, up to JOB_TIMEOUT
#      (1860: the Job's own activeDeadlineSeconds is 1800). `kubectl wait --for=condition=complete`
#      would sit until its timeout on a Failed Job (backoffLimit 0).
#   4. Always print the Job's log. Exit 0 only on Complete.
# =============================================================================
set -uo pipefail
NS="${1:?usage: migrate-job.sh <namespace> <rendered-migrate.yaml>}"
FILE="${2:?usage: migrate-job.sh <namespace> <rendered-migrate.yaml>}"
ACTIVE_WAIT="${ACTIVE_WAIT:-1500}" JOB_TIMEOUT="${JOB_TIMEOUT:-1860}" POLL="${POLL:-5}"
k() { kubectl -n "$NS" "$@"; }
log() { echo "[migrate-job] $*"; }

waited=0
while [ "$(k get job migrate -o jsonpath='{.status.active}' 2>/dev/null)" ] \
      && [ "$(k get job migrate -o jsonpath='{.status.active}' 2>/dev/null)" != 0 ]; do
  if [ "$waited" -ge "$ACTIVE_WAIT" ]; then
    log "::error::a migrate Job is still running after ${ACTIVE_WAIT}s; not deleting it"; exit 1
  fi
  [ "$waited" = 0 ] && log "a migrate Job from an earlier deploy is still running: waiting for it"
  sleep "$POLL"; waited=$((waited + POLL))
done

k delete job migrate --ignore-not-found --wait=true >/dev/null || { log "::error::could not delete the old Job"; exit 1; }
k apply -f "$FILE" || { log "::error::could not apply the migrate Job"; exit 1; }

print_log() { log "--- migrate Job log ---"; k logs job/migrate --all-containers=true 2>&1 || log "(no log)"; }
waited=0
while :; do
  conditions=$(k get job migrate -o jsonpath='{range .status.conditions[?(@.status=="True")]}{.type} {end}' 2>/dev/null)
  case " $conditions " in
    *" Complete "*) print_log; log "migrate Job complete after ${waited}s"; exit 0 ;;
    *" Failed "*) print_log; log "::error::the migrate Job failed after ${waited}s; nothing else is applied"; exit 1 ;;
  esac
  if [ "$waited" -ge "$JOB_TIMEOUT" ]; then
    print_log; log "::error::the migrate Job did not finish within ${JOB_TIMEOUT}s"; exit 1
  fi
  sleep "$POLL"; waited=$((waited + POLL))
done
