#!/bin/sh
# The one place that picks gunicorn's worker class (PAD-697 R4): the image's CMD and the GKE
# manifests both run this script, so the VM and the cluster can never disagree.
#
# ROLE=api (default) and ROLE=worker's web side: sync threads, --threads ${GUNICORN_THREADS:-64}
#   (PAD-689). One worker: the registry and the scheduler are per-process (compass R-027).
# ROLE=events: gevent by default. Each stream is a greenlet, not a thread. psycogreen makes
#   psycopg2 cooperative from post_fork, before the app connects (backend/gunicorn_events.conf.py).
#   EVENTS_WORKER_CLASS=gthread runs the same role on threads (the fallback while gevent is measured).
# Never --preload: it would load the app in the arbiter, before gevent patches and psycogreen runs.
# No access log here. The stream's token rides in the query string, so a format with the request
# line or the query (PAD-435) must never be added; nginx keeps the redacted request log.
set -eu
# Trimmed and lowercased like padel_app.roles.process_role(), or ROLE=Events would run the events app
# on threads.
ROLE="$(printf '%s' "${ROLE:-api}" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')"
if [ "$ROLE" = "events" ] && [ "${EVENTS_WORKER_CLASS:-gevent}" = "gevent" ]; then
  exec gunicorn --config "${EVENTS_GUNICORN_CONF:-/app/gunicorn_events.conf.py}" --bind 0.0.0.0:80 --workers 1 \
    --worker-class gevent --worker-connections "${EVENTS_WORKER_CONNECTIONS:-1200}" \
    --timeout 3600 app:run_app
fi
exec gunicorn --bind 0.0.0.0:80 --workers 1 --threads "${GUNICORN_THREADS:-64}" --timeout 3600 app:run_app
