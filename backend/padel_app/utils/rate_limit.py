"""Per-IP sliding-window throttle for the public auth routes (PAD-228).

auth.login rule 7, auth.register rule 15, auth.password-recovery rule 10 and
auth.email-verification rule 13 (PAD-269): at
most N requests per window per client IP and scope, from the config knobs
`AUTH_RATE_LIMIT_<SCOPE>` ("count/seconds"; "0" disables that scope) and the
master switch `AUTH_RATE_LIMIT_ENABLED`. Over the limit the request is not
processed and answers 429 `{"error": "RATE_LIMITED", "retryAfterSeconds": n}`
with a `Retry-After` header.

The store is chosen by `AUTH_RATE_LIMIT_STORE` (PAD-693): `memory` keeps one
in-process store per Flask app (a restart empties it, and every process has its
own budget); `database` keeps the hits in `auth_rate_limit_hits`, so every
process draws on one budget. Time is read through `Limiter.clock` — wall-clock
seconds, so hits from different processes compare — and tests move it instead
of sleeping (R-008).
"""
import ipaddress
import logging
import random
import threading
import time
from collections import deque
from functools import wraps

from flask import current_app, jsonify, request

logger = logging.getLogger(__name__)

EXTENSION_KEY = "auth_rate_limit"
#: Rows older than this many seconds are pruned: the longest configured window (the demo form's hour).
PRUNE_AFTER_SECONDS = 3600
PRUNE_ONE_IN = 100


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
    """The client's address for the per-IP throttle (PAD-554, B-382).

    `X-Real-IP` only: the host nginx sets it from `$remote_addr` on every proxied location
    (overwriting any copy the client sent), and `$remote_addr` is the real client because nginx
    resolves it from Cloudflare's `CF-Connecting-IP` for requests that come from Cloudflare's
    ranges (`infra/nginx/conf.d/levapp-cloudflare-real-ip.conf`). `X-Forwarded-For` is NEVER
    read: nginx keeps whatever the client put in it, so a fresh made-up entry per request used to
    be a fresh bucket and the auth limits never applied. Without a valid `X-Real-IP` (local runs,
    tests) the socket peer is the key.
    """
    real = (request.headers.get("X-Real-IP") or "").strip()
    if real:
        try:
            return str(ipaddress.ip_address(real))
        except ValueError:
            pass
    return request.remote_addr or "unknown"


def _retry_after(window, now, oldest):
    retry = window - (now - oldest)
    return max(int(retry) + (1 if retry % 1 else 0), 1)


class MemoryStore:
    """One process's hits, behind a lock (the gunicorn worker's threads share it)."""

    def __init__(self):
        self._hits = {}
        self._lock = threading.Lock()

    def check(self, scope, key, count, window, now):
        with self._lock:
            hits = self._hits.setdefault((scope, key), deque())
            while hits and now - hits[0] >= window:
                hits.popleft()
            if len(hits) >= count:
                return _retry_after(window, now, hits[0])
            hits.append(now)
            return 0

    def reset(self):
        with self._lock:
            self._hits.clear()

    def close(self):
        pass


class DatabaseStore:
    """Every process's hits in `auth_rate_limit_hits` (PAD-693).

    Each check runs on its own short transaction from a small pool of its own, never on the
    request's session: a hit counts even when the request later fails or rolls back, and a slow
    store waits at most 2 s. A per-key advisory lock spans the count and the insert, so two
    processes can never both take the last slot. `now` comes from the limiter's clock, never the
    database's `now()`, so tests move time the same way for both stores.
    """

    _LOCK = "SELECT pg_advisory_xact_lock(hashtextextended(:scope || chr(31) || :key, 0))"

    def __init__(self, uri):
        from sqlalchemy import create_engine

        self._engine = create_engine(uri, pool_size=2, max_overflow=3, pool_timeout=2, pool_pre_ping=True)

    def check(self, scope, key, count, window, now):
        from sqlalchemy import text

        args = {"scope": scope, "key": key, "now": now, "edge": now - window}
        with self._engine.begin() as conn:
            self._lock_key(conn, args)
            held, oldest = self._count(conn, args)
            if held >= count:
                return _retry_after(window, now, oldest)
            conn.execute(text(
                "INSERT INTO auth_rate_limit_hits (scope, key, hit_at) VALUES (:scope, :key, :now)"
            ), args)
        if random.randrange(PRUNE_ONE_IN) == 0:
            self.prune(now)
        return 0

    def _lock_key(self, conn, args):
        """Held until this check's transaction ends: one check per (scope, key) at a time."""
        from sqlalchemy import text

        conn.execute(text(self._LOCK), args)

    def _count(self, conn, args):
        """Drop this key's hits that left the window; return (hits still in it, the oldest)."""
        from sqlalchemy import text

        conn.execute(text(
            "DELETE FROM auth_rate_limit_hits WHERE scope = :scope AND key = :key AND hit_at <= :edge"
        ), args)
        return conn.execute(text(
            "SELECT count(*), min(hit_at) FROM auth_rate_limit_hits WHERE scope = :scope AND key = :key"
        ), args).one()

    def prune(self, now):
        """Drop every key's hits older than the longest window (keys a client never returns to)."""
        from sqlalchemy import text

        with self._engine.begin() as conn:
            conn.execute(text("DELETE FROM auth_rate_limit_hits WHERE hit_at < :edge"),
                         {"edge": now - PRUNE_AFTER_SECONDS})

    def reset(self):
        from sqlalchemy import text

        with self._engine.begin() as conn:
            conn.execute(text("DELETE FROM auth_rate_limit_hits"))

    def close(self):
        self._engine.dispose()


class Limiter:
    def __init__(self, store=None):
        self.store = store if store is not None else MemoryStore()
        self.clock = time.time

    def check(self, scope, key, count, window):
        """Record a hit for (scope, key). Returns 0 when allowed, else the
        seconds until the oldest hit in the window leaves it."""
        return self.store.check(scope, key, count, window, self.clock())

    def reset(self):
        self.store.reset()

    def close(self):
        self.store.close()


def _store_for(app):
    from padel_app.config import auth_rate_limit_store

    name = auth_rate_limit_store(app.config.get("AUTH_RATE_LIMIT_STORE"))
    uri = str(app.config.get("SQLALCHEMY_DATABASE_URI") or "")
    if name == "database" and not uri.startswith("postgresql"):
        logger.warning("AUTH_RATE_LIMIT_STORE=database falls back to memory: the database is not Postgres")
        name = "memory"
    return DatabaseStore(uri) if name == "database" else MemoryStore()


def limiter_for(app):
    limiter = app.extensions.get(EXTENSION_KEY)
    if limiter is None:
        limiter = app.extensions[EXTENSION_KEY] = Limiter(_store_for(app))
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
            try:
                retry = limiter_for(current_app._get_current_object()).check(scope, client_ip(), *limit)
            except Exception:  # noqa: BLE001 — a store hiccup never locks everyone out of signing in
                logger.warning("auth rate limit store unavailable: scope=%s", scope, exc_info=True)
                retry = 0
            if retry:
                res = jsonify({"error": "RATE_LIMITED", "retryAfterSeconds": retry})
                res.status_code = 429
                res.headers["Retry-After"] = str(retry)
                return res
            return view(*args, **kwargs)

        return wrapper

    return decorator
