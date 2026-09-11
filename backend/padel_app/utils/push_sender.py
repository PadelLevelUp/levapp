"""Bounded in-process push sender (PAD-294; messaging.push-notifications rule 10).

Every push channel does its database work on the caller (subscription or
device-token lookup, the unread badge), then hands the HTTP call here. One
FIFO daemon worker drains a queue of bounded size; the caller returns at once,
so its DB connection is never held across the network round trip and a slow
push service (10 s per call at the timeout) cannot stall the scheduler's
executor or a request.

- Full queue: the push is DROPPED with a WARNING naming the user. Push is
  best-effort already; blocking the engine would be worse than a missed alert.
- The job runs under the app context it was submitted from (cleanups such as
  `DeviceNotRegistered` need a session) and the worker removes the session
  after each job, so a connection is borrowed only for the cleanup.
- Process exit drains the queue for up to `DRAIN_SECONDS`.
- `PUSH_SENDER_INLINE` (app config; default: the app's TESTING flag) runs the
  job synchronously on the caller, which keeps the existing tests that stub
  `requests.post`/`webpush` deterministic. `flush()` waits for the queue.
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

_queue: "queue.Queue" = queue.Queue(maxsize=QUEUE_MAX)
_worker: threading.Thread | None = None
_lock = threading.Lock()
_stats = {"submitted": 0, "dropped": 0, "delivered": 0, "failed": 0}


def _inline() -> bool:
    if not has_app_context():
        return True
    value = current_app.config.get("PUSH_SENDER_INLINE")
    if value is None:
        return bool(current_app.config.get("TESTING"))
    return bool(value)


def _ensure_worker() -> None:
    global _worker
    with _lock:
        if _worker is not None and _worker.is_alive():
            return
        _worker = threading.Thread(target=_run, name="push-sender", daemon=True)
        _worker.start()


def _run() -> None:
    while True:
        app, fn, args, kwargs, label = _queue.get()
        try:
            with (app.app_context() if app is not None else nullcontext()):
                try:
                    fn(*args, **kwargs)
                    _stats["delivered"] += 1
                except Exception as exc:  # the senders already swallow; belt and braces
                    _stats["failed"] += 1
                    logger.warning("push sender: %s failed: %s", label, exc)
                finally:
                    if app is not None:
                        from padel_app.sql_db import db

                        db.session.remove()
        finally:
            _queue.task_done()


def submit(fn, *args, label: str = "push", **kwargs) -> bool:
    """Run ``fn(*args, **kwargs)`` on the worker (or inline under the test
    config). Returns False only when the queue is full and the push was dropped."""
    if _inline():
        fn(*args, **kwargs)
        return True
    app = current_app._get_current_object() if has_app_context() else None
    _ensure_worker()
    try:
        _queue.put_nowait((app, fn, args, kwargs, label))
    except queue.Full:
        _stats["dropped"] += 1
        logger.warning(
            "push sender: queue full (%d), dropping %s", _queue.maxsize, label
        )
        return False
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
