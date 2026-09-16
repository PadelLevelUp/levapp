"""Per-IP sliding-window throttle for the public auth routes (PAD-228).

auth.login rule 7, auth.register rule 15, auth.password-recovery rule 10 and
auth.email-verification rule 13 (PAD-269): at
most N requests per window per client IP and scope, from the config knobs
`AUTH_RATE_LIMIT_<SCOPE>` ("count/seconds"; "0" disables that scope) and the
master switch `AUTH_RATE_LIMIT_ENABLED`. Over the limit the request is not
processed and answers 429 `{"error": "RATE_LIMITED", "retryAfterSeconds": n}`
with a `Retry-After` header.

The store is in-process, one per Flask app: prod runs a single gunicorn
worker with threads, so a lock is all it takes; a restart empties it. Time is
read through `Limiter.clock` so tests move it instead of sleeping (R-008).
"""
import threading
import time
from collections import deque
from functools import wraps

from flask import current_app, jsonify, request

EXTENSION_KEY = "auth_rate_limit"


def parse_limit(value):
    """`"20/60"` -> (20, 60); `"0"`, empty or malformed -> None (off)."""
    raw = (str(value) if value is not None else "").strip()
    if not raw or raw == "0":
        return None
    try:
        count, window = raw.split("/", 1)
        count, window = int(count), int(window)
    except ValueError:
        return None
    if count <= 0 or window <= 0:
        return None
    return count, window


def client_ip():
    """First X-Forwarded-For entry when present (Cloud Run's load balancer),
    else the peer address. A spoofed header only moves the caller into a
    bucket of their own choosing; it never empties anyone else's."""
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    return request.remote_addr or "unknown"


class Limiter:
    def __init__(self):
        self._hits = {}
        self._lock = threading.Lock()
        self.clock = time.monotonic

    def check(self, scope, key, count, window):
        """Record a hit for (scope, key). Returns 0 when allowed, else the
        seconds until the oldest hit in the window leaves it."""
        now = self.clock()
        with self._lock:
            hits = self._hits.setdefault((scope, key), deque())
            while hits and now - hits[0] >= window:
                hits.popleft()
            if len(hits) >= count:
                retry = window - (now - hits[0])
                return max(int(retry) + (1 if retry % 1 else 0), 1)
            hits.append(now)
            return 0

    def reset(self):
        with self._lock:
            self._hits.clear()


def limiter_for(app):
    limiter = app.extensions.get(EXTENSION_KEY)
    if limiter is None:
        limiter = app.extensions[EXTENSION_KEY] = Limiter()
    return limiter


def rate_limited(scope):
    """Decorate a view with the per-IP throttle for `scope` (`login`,
    `register`, `recovery`, `verification`). Reads the config on every request so tests and
    operators can change the knob without a restart."""

    def decorator(view):
        @wraps(view)
        def wrapper(*args, **kwargs):
            cfg = current_app.config
            if not cfg.get("AUTH_RATE_LIMIT_ENABLED", True):
                return view(*args, **kwargs)
            limit = parse_limit(cfg.get(f"AUTH_RATE_LIMIT_{scope.upper()}"))
            if limit is None:
                return view(*args, **kwargs)
            retry = limiter_for(current_app._get_current_object()).check(scope, client_ip(), *limit)
            if retry:
                res = jsonify({"error": "RATE_LIMITED", "retryAfterSeconds": retry})
                res.status_code = 429
                res.headers["Retry-After"] = str(retry)
                return res
            return view(*args, **kwargs)

        return wrapper

    return decorator
