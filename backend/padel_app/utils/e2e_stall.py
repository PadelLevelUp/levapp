"""client.pull-to-refresh rule 6 (PAD-786): an E2E-only switch that holds requests unanswered.

Maestro flows 311 and 312 need a list request the app waits on past its client timeout. The flow
arms a path prefix and a delay; every request under that prefix then sleeps before it is handled,
until the flow disarms it. Nothing waits unless the switch is armed AND `E2E_DEBUG_ENDPOINTS` is
on, and the switch can only be armed through the flag-gated endpoints in `frontend_api`.

Process-local on purpose: the E2E backend is one Flask process (`flask run`, threaded), so a
sleeping request holds one thread and the rest keep answering.
"""
import threading
import time

from flask import request

from padel_app.utils.debug_flags import debug_endpoints_enabled

#: The longest a stall may last, so a forgotten switch cannot hold a thread for good.
MAX_STALL_SECONDS = 120

#: The switch's own endpoints (frontend_api).
SWITCH_PATH = "/api/app/debug/stall"

_lock = threading.Lock()
_armed: dict | None = None


def arm(path: str, seconds: float) -> dict:
    global _armed
    with _lock:
        _armed = {"path": path, "seconds": max(0.0, min(float(seconds), MAX_STALL_SECONDS))}
        return dict(_armed)


def disarm() -> None:
    global _armed
    with _lock:
        _armed = None


def gate() -> None:
    """`before_request`: sleep when the request's path is under the armed prefix."""
    armed = _armed
    if armed is None or not request.path.startswith(armed["path"]):
        return
    if request.path.startswith(SWITCH_PATH):
        return  # the switch itself never waits, so a flow can always disarm it
    if not debug_endpoints_enabled():
        return
    time.sleep(armed["seconds"])
