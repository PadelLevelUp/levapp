"""Which process this is (delivery.worker-role rule 1, PAD-695; the events role is PAD-697's).

A leaf module so that config, the scheduler and the events role can all ask without importing
each other.
"""
import os

ROLES = ("api", "worker", "events")


def process_role(environ=None) -> str:
    """``ROLE`` = api | worker | events, default api; anything else is api."""
    environ = os.environ if environ is None else environ
    role = environ.get("ROLE", "api").strip().lower()
    return role if role in ROLES else "api"


TRUTHY = ("1", "true", "yes", "on")


def flag_enabled(name, environ=None, default="off") -> bool:
    """An on/off env switch (WORKER_SPLIT, EVENTS_SPLIT): on, 1, true or yes, any case."""
    environ = os.environ if environ is None else environ
    return str(environ.get(name, default)).strip().lower() in TRUTHY
