#!/bin/sh
# The migrate step (PAD-691; delivery.zero-downtime-deploy rule 9): bring the schema to this
# image's head under an advisory lock. Run by `rollout.sh --migrate` in a one-shot container,
# by sync-staging-db.sh after a restore, and later by the GKE migrate Job.
set -e
cd /app 2>/dev/null || cd "$(dirname "$0")/.."
exec python -m padel_app.migrate
