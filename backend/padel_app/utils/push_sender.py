"""Bounded in-process push sender (PAD-294; messaging.push-notifications rule 10).

Every push channel does its database work on the caller (subscription or
device-token lookup, the unread badge), then hands the HTTP call here. One
FIFO daemon worker drains a queue of bounded size; the caller returns at once,
so its DB connection is never held across the network round trip and a slow
push service (10 s per call at the timeout) cannot stall the scheduler's
executor or a request.

Policy (rule 10, review of PR #212):
- Full queue: the OLDEST queued push is dropped, with a WARNING naming it, and
  the new one is queued — the newest push is the most recent event (a
  reminder, a fresh message), and push is best-effort already.
- Provider outage: after ``CIRCUIT_TRIP`` consecutive deliveries slower than
  ``SLOW_SECONDS`` (the HTTP timeout is 10 s) the sender pauses for
  ``CIRCUIT_SECONDS`` and drops pushes with a WARNING instead of queueing
  hundreds that would each wait out the timeout; delivery resumes after.
- One ``_execute`` path for the worker and for the inline test-config mode, so
  a sender exception is logged and swallowed the same way in both.
- Each job runs under the app context it was submitted from (cleanups such as
  ``DeviceNotRegistered`` need a session) and the worker removes the session
  after each job, so a connection is borrowed only for the cleanup.
- Process exit drains the queue for up to ``DRAIN_SECONDS`` (5 s), inside the
  10 s Docker stop grace the deploy uses.
- ``PUSH_SENDER_INLINE`` (app config; default: the app's TESTING flag) runs
  the job synchronously on the caller. ``flush()`` waits for the queue.
"""
import atexit
import logging
import os
import queue
import threading
import time
from contextlib import nullcontext

from flask import current_app, has_app_context

logger = logging.getLogger(__name__)

QUEUE_MAX = int(os.getenv("PUSH_QUEUE_MAX", "500") or 500)
DRAIN_SECONDS = 5.0
#: A delivery slower than this counts as a provider timeout (requests' timeout is 10 s).
SLOW_SECONDS = 8.0
#: Consecutive slow deliveries that open the circuit.
CIRCUIT_TRIP = 3
#: How long the sender pauses once the circuit is open.
CIRCUIT_SECONDS = 60.0

_queue: "queue.Queue" = queue.Queue(maxsize=QUEUE_MAX)
_worker: threading.Thread | None = None
_lock = threading.Lock()
_stats = {"submitted": 0, "dropped": 0, "delivered": 0, "failed": 0}
_circuit = {"slow_streak": 0, "open_until": 0.0}


def _inline() -> bool:
    if not has_app_context():
        return True
    value = current_app.config.get("PUSH_SENDER_INLINE")
    if value is None:
        return bool(current_app.config.get("TESTING"))
    return bool(value)


def circuit_open() -> bool:
    """Is the sender pausing after consecutive provider timeouts?"""
    return time.monotonic() < _circuit["open_until"]


def reset_circuit() -> None:
    """Tests: forget the slow streak and any pause."""
    with _lock:
        _circuit["slow_streak"] = 0
        _circuit["open_until"] = 0.0


def _note_duration(elapsed: float) -> None:
    with _lock:
        if elapsed < SLOW_SECONDS:
            _circuit["slow_streak"] = 0
            return
        _circuit["slow_streak"] += 1
        if _circuit["slow_streak"] >= CIRCUIT_TRIP:
            _circuit["slow_streak"] = 0
            _circuit["open_until"] = time.monotonic() + CIRCUIT_SECONDS
            logger.warning(
                "push sender: %d consecutive deliveries slower than %.0f s — provider "
                "unresponsive, pausing pushes for %.0f s",
                CIRCUIT_TRIP, SLOW_SECONDS, CIRCUIT_SECONDS,
            )


def _execute(fn, args, kwargs, label: str) -> bool:
    """Run one delivery: never raises, logs a failure, feeds the circuit."""
    started = time.monotonic()
    try:
        fn(*args, **kwargs)
        ok = True
    except Exception as exc:
        ok = False
        logger.warning("push sender: %s failed: %s", label, exc)
    _stats["delivered" if ok else "failed"] += 1
    _note_duration(time.monotonic() - started)
    return ok


def _ensure_worker() -> None:
    global _worker
    with _lock:
        if _worker is not None and _worker.is_alive():
            return
        # Bound to the queue it starts on: a worker never wanders onto a queue
        # swapped in later (tests patch the queue), so there is exactly one
        # consumer per queue and FIFO order holds.
        _worker = threading.Thread(target=_run, args=(_queue,), name="push-sender", daemon=True)
        _worker.start()


def _run(q: "queue.Queue") -> None:
    while True:
        app, fn, args, kwargs, label = q.get()
        try:
            with (app.app_context() if app is not None else nullcontext()):
                try:
                    _execute(fn, args, kwargs, label)
                finally:
                    if app is not None:
                        from padel_app.sql_db import db

                        db.session.remove()
        finally:
            q.task_done()


def submit(fn, *args, label: str = "push", **kwargs) -> bool:
    """Deliver ``fn(*args, **kwargs)`` on the worker (or inline under the test
    config). Returns False only when the push was dropped because the sender
    is paused after consecutive provider timeouts."""
    if _inline():
        _execute(fn, args, kwargs, label)
        return True
    if circuit_open():
        _stats["dropped"] += 1
        logger.warning("push sender: provider unresponsive, dropping %s until the pause ends", label)
        return False
    app = current_app._get_current_object() if has_app_context() else None
    _ensure_worker()
    job = (app, fn, args, kwargs, label)
    while True:
        try:
            _queue.put_nowait(job)
            break
        except queue.Full:
            try:
                oldest = _queue.get_nowait()
            except queue.Empty:
                continue
            _queue.task_done()
            _stats["dropped"] += 1
            logger.warning(
                "push sender: queue full (%d), dropping oldest: %s", _queue.maxsize, oldest[4]
            )
    _stats["submitted"] += 1
    return True


def pending() -> int:
    return _queue.unfinished_tasks


def flush(timeout: float | None = None) -> bool:
    """Wait until every submitted push has run. Returns False on timeout."""
    if timeout is None:
        _queue.join()
        return True
    deadline = time.monotonic() + timeout
    while _queue.unfinished_tasks:
        if time.monotonic() >= deadline:
            return False
        time.sleep(0.01)
    return True


def stats() -> dict:
    return dict(_stats)


def _drain_at_exit() -> None:
    if _queue.unfinished_tasks and not flush(timeout=DRAIN_SECONDS):
        logger.warning("push sender: %d pushes still queued at exit", _queue.unfinished_tasks)


atexit.register(_drain_at_exit)
