#!/usr/bin/env bash
# Watch the deploy workflow for one specific commit, then prove prod actually came back.
#
# Two things this guards against that a naive `gh run watch` does not:
#
#  1. Selecting the wrong run. Both repos use `concurrency: cancel-in-progress: false`,
#     so deploys queue. `gh run list --branch main | head -1` can hand you a run for
#     somebody else's push. We select by commit SHA.
#
#  2. Believing a green workflow. The deploy step is `docker run -d` over SSH — it
#     returns success the instant the container is created. The container can then
#     Exit(1) seconds later (this is exactly the 2026-07-06 multiple-Alembic-heads
#     outage: deploy "succeeded", every /api/* returned 502). So a green run is
#     necessary but not sufficient; we finish with a real HTTP probe.
#
# Usage: watch_deploy.sh <repo> <commit-sha> [timeout-seconds]
#   repo: PadelLevelUp/levelup_backend | PadelLevelUp/levelup_frontend
#
# Exit codes: 0 healthy · 1 workflow failed · 2 timed out · 3 workflow green but prod unhealthy

set -uo pipefail

REPO="${1:?usage: watch_deploy.sh <repo> <sha> [timeout]}"
SHA="${2:?usage: watch_deploy.sh <repo> <sha> [timeout]}"
TIMEOUT="${3:-900}"
POLL=20

# Pin auth: the private frontend repo is invisible to the account that is often
# globally active, and concurrent sessions flip `gh auth switch` back mid-run.
if [ -z "${GH_TOKEN:-}" ]; then
  GH_TOKEN="$(gh auth token --user pedropacheco95 2>/dev/null)"
  export GH_TOKEN
fi

HEALTH_URL="${HEALTH_URL:-https://padellevelup.com/api/app/healthz}"
FRONTEND_URL="${FRONTEND_URL:-https://padellevelup.com/}"

echo "Watching deploy of ${SHA:0:8} in $REPO (timeout ${TIMEOUT}s)"

deadline=$(( $(date +%s) + TIMEOUT ))
run_id=""

# Phase 1 — find the run for THIS commit. It may not exist yet; GitHub takes a few
# seconds to register a workflow after the push.
while [ "$(date +%s)" -lt "$deadline" ]; do
  run_id=$(gh run list --repo "$REPO" --commit "$SHA" --limit 1 --json databaseId \
             --jq '.[0].databaseId' 2>/dev/null)
  [ -n "$run_id" ] && [ "$run_id" != "null" ] && break
  echo "  … no workflow run registered for this commit yet"
  sleep "$POLL"
done

if [ -z "$run_id" ] || [ "$run_id" = "null" ]; then
  echo "TIMEOUT: no workflow run ever appeared for $SHA."
  echo "Check that the push landed on main: gh api repos/$REPO/commits/$SHA"
  exit 2
fi

echo "  run $run_id — https://github.com/$REPO/actions/runs/$run_id"

# Phase 2 — poll to completion. Runs queue behind each other, so "queued" is normal
# and not a reason to bail early.
while [ "$(date +%s)" -lt "$deadline" ]; do
  read -r status conclusion < <(gh run view "$run_id" --repo "$REPO" \
                                  --json status,conclusion \
                                  --jq '[.status, (.conclusion // "-")] | @tsv' 2>/dev/null)
  echo "  status=$status conclusion=$conclusion"
  if [ "$status" = "completed" ]; then
    if [ "$conclusion" != "success" ]; then
      echo "FAILED: deploy concluded '$conclusion'."
      echo "Failing step log:"
      gh run view "$run_id" --repo "$REPO" --log-failed 2>/dev/null | tail -60
      exit 1
    fi
    break
  fi
  sleep "$POLL"
done

if [ "$status" != "completed" ]; then
  echo "TIMEOUT: run $run_id still $status after ${TIMEOUT}s."
  exit 2
fi

echo "  workflow green — now proving prod is actually serving"

# Phase 3 — health probe. The container restart plus `flask db upgrade` takes a
# little while after the workflow reports done, so allow a short settle window
# rather than probing once and panicking.
probe_deadline=$(( $(date +%s) + 180 ))
while [ "$(date +%s)" -lt "$probe_deadline" ]; do
  api=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$HEALTH_URL")
  web=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$FRONTEND_URL")
  echo "  probe api=$api web=$web"
  if [ "$api" = "200" ] && [ "$web" = "200" ]; then
    echo "HEALTHY: ${SHA:0:8} deployed and serving."
    exit 0
  fi
  sleep 15
done

cat <<EOF
UNHEALTHY: workflow succeeded but prod is not serving (api=$api web=$web).

Most likely the backend container is crash-looping on startup. The classic cause
after a batch merge is multiple Alembic heads — \`flask db upgrade\` aborts, the
container Exits(1), nginx returns 502 on every /api/* call. Diagnose with:

  gcloud compute ssh levelup-instance --zone=europe-west1-b --project=padel-levelup-2026
  sudo docker ps -a && sudo docker logs padelapp --tail 50

If it is multiple heads, add a no-op merge migration (down_revision = tuple of
both heads) and push it to main to redeploy.
EOF
exit 3
