"""The events role: `/api/app/events` served by its own process (PAD-697, delivery.events-role).

`ROLE=events` runs the same app with one job: hold the live-update streams. It answers only the
stream route and its two probes; everything else is a 404, so a misrouted API call is loud. The
streams receive what the API publishes only through the Postgres broker (PAD-692), so under
`SSE_BROKER=memory` this process is never ready (R1): the rollout keeps the old container serving
instead of routing clients to a process whose streams would stay silent.

`EVENTS_SPLIT=on` in the API answers 410 on the moved path. It is set only after the host routes
the path to the events upstream (R3: the 410 comes last).
"""
import os

from flask import jsonify, request

from padel_app.roles import process_role

EVENTS_PATH = "/api/app/events"
EVENTS_ROLE_PATHS = frozenset({EVENTS_PATH, "/api/app/livez", "/api/app/healthz"})


def events_split_enabled(environ=None) -> bool:
    environ = os.environ if environ is None else environ
    return str(environ.get("EVENTS_SPLIT", "off")).strip().lower() in ("1", "true", "yes", "on")


def init_app(app) -> None:
    role = process_role()
    if role == "events":
        from padel_app import realtime

        if realtime.broker_status()["broker"] != "postgres":
            app.logger.error(
                "ROLE=events needs SSE_BROKER=postgres: under memory it receives nothing the API "
                "publishes, so this process stays unready (PAD-697 R1)."
            )
        else:
            # The API starts its listener with the first stream; here streams are the whole job, and
            # readiness depends on it, so it starts at boot.
            realtime.ensure_listener()
        app.before_request(_events_only)
    elif role == "api" and events_split_enabled():
        app.before_request(_events_moved)


def _events_only():
    if request.path not in EVENTS_ROLE_PATHS:
        return jsonify({"error": "NOT_ON_EVENTS"}), 404
    return None


def _events_moved():
    if request.path == EVENTS_PATH:
        return jsonify({"error": "EVENTS_MOVED"}), 410
    return None


def readiness_problem():
    """None when this process may take traffic, else the status string healthz reports. Only the
    events role has a condition here: the API must not go unready over a LISTEN outage (PAD-692)."""
    if process_role() != "events":
        return None
    from padel_app import realtime

    status = realtime.broker_status()
    if status["broker"] != "postgres":
        return "events_needs_postgres_broker"
    if not status["listening"]:
        return "listener_down"
    return None
