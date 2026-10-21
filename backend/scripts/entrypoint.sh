#!/bin/sh
set -e

# PAD-691 (delivery.zero-downtime-deploy rule 10): the container no longer migrates; the deploy's
# migrate step (scripts/migrate.sh) does, before this container starts. Against a schema behind
# this image's head it refuses to start, before gunicorn binds a port: on the VM nginx would
# otherwise send it requests. SCHEMA_GATE=off skips the check.
python -m padel_app.schema_state --require not_behind

echo "Starting app..."
exec "$@"
