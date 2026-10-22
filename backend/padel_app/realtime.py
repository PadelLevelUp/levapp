"""SSE fan-out, scoped to named recipients, across one or many processes.

Until PAD-206 this was an anonymous ``list[queue.Queue]`` and ``publish(event)``
pushed every event into every queue: the process had no idea which user a queue
belonged to, so every private message, edit, delete and reaction reached every
connected client. Web and iOS discarded events for conversations they were not
showing, but that is a *rendering* decision taken after the payload is already
on the wire — never a privacy boundary (B-004).

The registry is now keyed by user id. `subscribe(user_id)` registers one queue
for one open SSE connection; a single user may hold several (two tabs, web and
phone), and all of them are served. `publish(event, user_ids)` delivers only to
the queues of the users it names.

``user_ids`` is deliberately a **required** argument. Making it optional — even
defaulting to "everyone" for convenience — would let the broadcast come back by
omission, which is exactly how B-004 lasted five months. A caller that does not
know its recipients has a bug at the call site, and `TypeError` says so loudly.

The registry is per-process and in memory. What carries an event between
processes is the broker (`messaging.sse-realtime` rules 20-24, PAD-692):

* ``SSE_BROKER=memory`` (default): `publish` walks this process's registry, so
  production must run one gunicorn worker (compass R-027).
* ``SSE_BROKER=postgres``: `publish` writes the event to `realtime_events` and
  ``NOTIFY levapp_events, '<row id>'`` on its own short transaction; every process
  that holds streams runs one listener thread on a dedicated connection, reads
  the notified rows and fans them out to its own registry — its own publishes
  included, so there is one delivery path. The NOTIFY carries an id because
  payloads stop at 8,000 bytes and a message body has no length limit.

NOTIFY is not durable. When the listener's connection drops it reconnects and
sends ``{"type": "resync"}`` down every local stream, the same signal clients
already answer after their own re-open (PAD-616); nothing is replayed.
"""

import json
import logging
import os
import queue
import random
import selectors
import threading
import time
from collections.abc import Iterable
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

#: Put into a queue to end its stream at once: the per-user cap evicts a
#: user's oldest stream this way (messaging.sse-realtime rule 12, PAD-277).
STOP = object()

#: What a stream receives after its process's listener reconnected (rule 24).
RESYNC_EVENT = {"type": "resync"}

CHANNEL = "levapp_events"
LISTENER_APPLICATION_NAME = "levapp-realtime-listener"
BROKERS = ("memory", "postgres")
DEFAULT_RETENTION_MINUTES = 10
LISTEN_POLL_SECONDS = 5
PRUNE_EVERY_SECONDS = 60
RECONNECT_MIN_SECONDS = 1
RECONNECT_MAX_SECONDS = 30
#: How often a stream-holding process logs its stats line (rule 25, PAD-689).
MONITOR_SECONDS = 60

# user id -> the queues that user currently has open
_subscribers: dict[int, list[queue.Queue]] = {}

# The registry is touched from every request thread (a publish) and from the
# long-lived SSE generator threads (subscribe/unsubscribe). Mutating a dict of
# lists from several threads without a lock can drop a registration.
_lock = threading.Lock()

# The broker configuration, set by `init_app` for the whole process.
_broker = {"name": "memory", "uri": None, "retention_minutes": DEFAULT_RETENTION_MINUTES}
_broker_lock = threading.Lock()
_engine = None
_listener = None
_monitor = None
#: The server-wide stream cap this process enforces, for the stats line (set by `init_app`).
_cap = None


# --- configuration (rule 20) --------------------------------------------------------------------

def init_app(app) -> None:
    """Choose the broker from ``SSE_BROKER`` for this process. Anything but ``postgres`` is
    ``memory``; ``postgres`` on a database that is not Postgres falls back to ``memory``."""
    from padel_app.config import realtime_retention_minutes, sse_broker

    # B-676: nothing sets a level below the root logger (WARNING), so this module's INFO lines —
    # rule 25's per-minute stats line, "LISTEN ready" — were dropped before any handler saw them.
    # This logger only: no other module's log volume changes.
    logger.setLevel(logging.INFO)
    name = sse_broker(app.config.get("SSE_BROKER"))
    uri = str(app.config.get("SQLALCHEMY_DATABASE_URI") or "")
    if name == "postgres" and not uri.startswith("postgresql"):
        logger.warning("SSE_BROKER=postgres falls back to memory: the database is not Postgres")
        name = "memory"
    retention = realtime_retention_minutes(app.config.get("REALTIME_EVENTS_RETENTION_MINUTES"))
    global _cap
    _cap = app.config.get("SSE_MAX_STREAMS")
    with _broker_lock:
        stale = _detach_locked() if (name, uri) != (_broker["name"], _broker["uri"]) else (None, None)
        _broker.update(name=name, uri=uri if name == "postgres" else None, retention_minutes=retention)
    _close(*stale)


def broker_status() -> dict:
    """``{broker, listening, since}``. Not part of readiness while the API and the streams share a
    process: a LISTEN outage degrades live updates to a resync, it does not make the API unready."""
    listener = _listener
    return {
        "broker": _broker["name"],
        "listening": bool(listener and listener.listening),
        "since": listener.since if listener else None,
    }


def shutdown() -> None:
    """Stop this process's listener and close the publish pool (tests, and a reconfiguration)."""
    with _broker_lock:
        stale = _detach_locked()
    _close(*stale)


def _detach_locked():
    """Take the listener, the monitor and the pool out of service under the lock; `_close` them
    after it, so a listener's up-to-5 s join never holds up a publish waiting for `_publish_engine`."""
    global _engine, _listener, _monitor
    stale = (_listener, _engine, _monitor)
    _listener = _engine = _monitor = None
    return stale


def _close(listener, engine, monitor=None) -> None:
    for thread in (listener, monitor):
        if thread is not None:
            thread.stop()
    if engine is not None:
        engine.dispose()


def _publish_engine():
    """The publish path's own small pool (rule 21): a request already holds a connection of the
    main pool, so borrowing a second one there could wait the main pool's 30 s. Here a publish
    waits at most 2 s, and is then dropped."""
    global _engine
    with _broker_lock:
        if _engine is None:
            from sqlalchemy import create_engine

            _engine = create_engine(
                _broker["uri"], pool_size=2, max_overflow=3, pool_timeout=2, pool_pre_ping=True,
            )
        return _engine


# --- the local registry -------------------------------------------------------------------------

def subscribe(user_id: int) -> queue.Queue:
    """Register a queue for one open SSE connection belonging to ``user_id``, and start this
    process's listener if the broker is Postgres (rule 23). The route uses `try_subscribe`."""
    user_id = int(user_id)
    q: queue.Queue = queue.Queue()
    with _lock:
        _subscribers.setdefault(user_id, []).append(q)
    ensure_listener()
    ensure_monitor()
    return q


def stream_count() -> int:
    """Number of open SSE connections across every user."""
    with _lock:
        return sum(len(queues) for queues in _subscribers.values())


def try_subscribe(user_id: int, *, max_total: int, max_per_user: int):
    """Register a queue for ``user_id``; return ``(queue, None)`` or
    ``(None, "total")`` (messaging.sse-realtime rules 11-13, PAD-277).

    Over the per-user cap the user's OLDEST queues are evicted to make room
    and sent ``STOP``, which ends their streams at once. The newest connection
    is almost always the live one (a reloaded tab); the oldest is most likely
    one whose client is gone but not yet noticed by a keep-alive. Only the
    server-wide cap refuses, and it is judged on the total AFTER that eviction,
    so a user already at their own cap always gets through and a refusal
    never evicts anyone. Check, eviction and registration share one lock
    acquisition, so two requests can never both take the last slot.
    """
    user_id = int(user_id)
    with _lock:
        queues = _subscribers.get(user_id, [])
        to_evict = max(0, len(queues) - max_per_user + 1)
        total = sum(len(qs) for qs in _subscribers.values())
        if total - to_evict >= max_total:
            return None, "total"
        evicted = queues[:to_evict]
        q: queue.Queue = queue.Queue()
        _subscribers[user_id] = queues[to_evict:] + [q]

    # Outside the lock, like publish(): a put must never block a subscribe.
    _put_all(evicted, STOP)
    if evicted:
        logger.info("SSE stream evicted: user=%s evicted=%s", user_id, len(evicted))
    # Rule 23: the first stream a process accepts starts its listener; rule 25: and its monitor.
    ensure_listener()
    ensure_monitor()
    return q, None


def unsubscribe(user_id: int, q: queue.Queue) -> None:
    """Drop one connection's queue, leaving that user's other queues alone."""
    user_id = int(user_id)
    with _lock:
        queues = _subscribers.get(user_id)
        if not queues:
            return
        if q in queues:
            queues.remove(q)
        if not queues:
            # Don't leak an empty list per user who ever connected.
            del _subscribers[user_id]


def _put_all(queues, item) -> None:
    for q in queues:
        try:
            q.put_nowait(item)
        except Exception:
            # One dead subscriber must never stop the others from being served.
            pass


def _deliver_local(event, recipients: Iterable[int]) -> None:
    with _lock:
        # Snapshot under the lock; deliver outside it, so a slow put_nowait
        # never blocks a subscribe.
        targets = [q for uid in recipients for q in _subscribers.get(uid, ())]
    _put_all(targets, event)


def _resync_all() -> None:
    with _lock:
        targets = [q for queues in _subscribers.values() for q in queues]
    _put_all(targets, dict(RESYNC_EVENT))


# --- publish (rules 8, 21, 22) ------------------------------------------------------------------

def publish(event: dict, user_ids: Iterable[int]) -> None:
    """Deliver ``event`` to every open queue of every user in ``user_ids``, in every process.

    ``user_ids`` may legitimately be empty (a conversation whose only other
    participant was deleted, say) — that delivers to nobody, which is correct.
    What it may never be is absent.
    """
    from padel_app.utils.view_as import suppressed

    # admin.approvals-and-users rule 9 (PAD-532): nothing leaves under a view-as token.
    if suppressed("realtime"):
        return
    recipients = {int(uid) for uid in user_ids if uid is not None}
    if not recipients:
        return

    if _broker["name"] != "postgres":
        _deliver_local(event, recipients)
        return

    from padel_app.tools.unit_of_work import active

    if active():
        # Rule 21: inside a unit of work create()/save() only flush; the row this event is about
        # is not committed yet, so the event waits for that commit (and dies with a rollback).
        from padel_app.tools.after_commit import on_commit

        on_commit(lambda: _broker_publish(event, recipients))
        return
    _broker_publish(event, recipients)


def _broker_publish(event: dict, recipients: set) -> None:
    """One row and its NOTIFY on the publish pool's own transaction, never the request's session:
    publishers run after their own commit, and the request teardown would roll back anything
    left on the session (design 2026-10-21 §0.1). A live event never fails the request."""
    from sqlalchemy import text

    try:
        body = json.dumps(event)
        with _publish_engine().begin() as conn:
            row_id = conn.execute(
                text("INSERT INTO realtime_events (user_ids, body) VALUES (:u, :b) RETURNING id"),
                {"u": json.dumps(sorted(recipients)), "b": body},
            ).scalar_one()
            conn.execute(text("SELECT pg_notify(:c, :p)"), {"c": CHANNEL, "p": str(row_id)})
    except Exception:  # noqa: BLE001 — like a failed put_nowait: logged, never raised
        logger.warning("realtime publish dropped: type=%s", (event or {}).get("type"), exc_info=True)


_PRUNE_SQL = "DELETE FROM realtime_events WHERE created_at < now() - make_interval(mins => %(m)s)"


def prune_events(retention_minutes: int) -> None:
    """Delete `realtime_events` rows older than the retention (rule 24) — the listener's own step,
    on a pool connection, for a caller that holds no listener."""
    conn = _publish_engine().raw_connection()
    try:
        with conn.cursor() as cur:
            _prune(cur, retention_minutes)
        conn.commit()
    finally:
        conn.close()


def _prune(cursor, retention_minutes: int) -> None:
    cursor.execute(_PRUNE_SQL, {"m": int(retention_minutes)})


# --- observability (rule 25, PAD-689) -----------------------------------------------------------

def stats_line() -> str:
    """One line for the logs: open streams, the busiest user's count, the cap, the push queue.
    The text is what the log-based dashboards and alerts parse; keep its shape."""
    from padel_app.utils import push_outbox, push_sender

    with _lock:
        counts = [len(queues) for queues in _subscribers.values()]
    push = push_sender.stats()
    return (
        f"SSE streams: open={sum(counts)} max_per_user={max(counts, default=0)} cap={_cap} "
        f"push_queue={push_sender.pending()}/{push_sender.QUEUE_MAX} pushes_dropped={push['dropped']}"
        f"{push_outbox.stats_fragment()}"
    )


def ensure_monitor() -> None:
    """Start this process's stats logger if none is running; both broker modes have one."""
    global _monitor
    with _broker_lock:
        if _monitor is not None and _monitor.is_alive():
            return
        _monitor = _Monitor()
        _monitor.start()


class _Monitor(threading.Thread):
    """Logs `stats_line()` every `MONITOR_SECONDS` in the process that holds the streams (not an
    APScheduler job: the scheduler is leaving the API process, PAD-695)."""

    def __init__(self):
        super().__init__(name="realtime-monitor", daemon=True)
        self._stopping = threading.Event()

    def stop(self) -> None:
        self._stopping.set()
        self.join(timeout=5)

    def run(self) -> None:
        while not self._stopping.wait(MONITOR_SECONDS):
            try:
                logger.info(stats_line())
            except Exception:  # noqa: BLE001 — a stats line never kills its thread
                logger.warning("realtime monitor: stats line failed", exc_info=True)


# --- the listener (rules 23, 24) ----------------------------------------------------------------

def ensure_listener() -> None:
    """Start this process's listener if the broker is Postgres and none is running."""
    global _listener
    if _broker["name"] != "postgres":
        return
    with _broker_lock:
        if _broker["name"] != "postgres" or (_listener is not None and _listener.is_alive()):
            return
        _listener = _Listener(_broker["uri"], _broker["retention_minutes"])
        _listener.start()


def _in_arrival_order(ids, rows):
    """Rows in the order their notifications arrived, which is commit order; a lower id can commit
    after a higher one, so ``ORDER BY id`` would not do. An id whose row is gone is skipped."""
    by_id = {row[0]: row for row in rows}
    return [by_id[i] for i in ids if i in by_id]


def _listener_dsn(uri: str) -> str:
    """The SQLAlchemy URI as a libpq URI (driver suffix dropped, every query option kept)."""
    from sqlalchemy.engine import make_url

    return make_url(uri).set(drivername="postgresql").render_as_string(hide_password=False)


class _Listener(threading.Thread):
    """``LISTEN levapp_events`` on a dedicated autocommit connection, outside the SQLAlchemy pool
    and never through a transaction-mode pooler. No SQLAlchemy session lives on this thread."""

    def __init__(self, uri: str, retention_minutes: int):
        super().__init__(name="realtime-listener", daemon=True)
        self._uri = uri
        self._retention = retention_minutes
        self._stopping = threading.Event()
        self._wake_r, self._wake_w = os.pipe()
        self.listening = False
        self.since = None

    def stop(self) -> None:
        self._stopping.set()
        try:
            os.write(self._wake_w, b"x")
        except OSError:
            pass
        self.join(timeout=5)

    def _connect(self):
        import psycopg2

        return psycopg2.connect(
            _listener_dsn(self._uri),
            application_name=LISTENER_APPLICATION_NAME,
            # A silently dead peer is noticed by TCP, not only by the next query.
            keepalives=1, keepalives_idle=30, keepalives_interval=10, keepalives_count=3,
        )

    def run(self) -> None:
        attempt = 0
        # Events may have been missed while nothing was LISTENing: before the first LISTEN (the
        # stream that started this listener is already open), after a failed connect, after a
        # dropped connection. Each LISTEN that follows such a gap resyncs every local stream.
        missed = True
        while not self._stopping.is_set():
            conn = None
            try:
                conn = self._connect()
                conn.autocommit = True
                with conn.cursor() as cur:
                    cur.execute(f"LISTEN {CHANNEL}")
                self.listening, self.since = True, datetime.now(timezone.utc).isoformat()
                logger.info("realtime listener: LISTEN ready")
                attempt = 0
                if missed:
                    # Rule 24: streams open across the gap catch up as after their own re-open.
                    _resync_all()
                    missed = False
                self._loop(conn)
            except Exception:  # noqa: BLE001 — any failure ends in a reconnect, never a dead thread
                if not self._stopping.is_set():
                    logger.warning("realtime listener: connection lost, reconnecting", exc_info=True)
                missed = True
            finally:
                self.listening = False
                if conn is not None:
                    try:
                        conn.close()
                    except Exception:
                        pass
            if self._stopping.is_set():
                break
            ceiling = min(RECONNECT_MAX_SECONDS, RECONNECT_MIN_SECONDS * 2 ** attempt)
            attempt += 1
            self._stopping.wait(random.uniform(ceiling / 2, ceiling))
        for fd in (self._wake_r, self._wake_w):
            try:
                os.close(fd)
            except OSError:
                pass

    def _loop(self, conn) -> None:
        # A selector, not select.select: a busy process holds hundreds of sockets, and select()
        # refuses any descriptor at or above FD_SETSIZE (1024).
        with selectors.DefaultSelector() as selector:
            selector.register(conn, selectors.EVENT_READ)
            selector.register(self._wake_r, selectors.EVENT_READ)
            last_prune = 0.0
            while not self._stopping.is_set():
                if time.monotonic() - last_prune >= PRUNE_EVERY_SECONDS:
                    self._prune_step(conn)
                    last_prune = time.monotonic()
                # A notification that arrived during any query on this connection (the prune, a
                # fetch) is already filed in conn.notifies and leaves the socket unreadable:
                # serve those first, or the wait below sleeps a whole poll interval on them.
                if not conn.notifies:
                    ready = selector.select(LISTEN_POLL_SECONDS)
                    if any(key.fileobj == self._wake_r for key, _ in ready):
                        return
                    conn.poll()
                ids = []
                while conn.notifies:
                    note = conn.notifies.pop(0)
                    if note.channel == CHANNEL:
                        try:
                            ids.append(int(note.payload))
                        except ValueError:
                            pass
                if ids:
                    self._deliver(conn, ids)

    def _prune_step(self, conn) -> None:
        """A failed prune is logged, not taken for a lost connection (which would resync every
        stream); only a connection that is really closed goes on to the reconnect."""
        try:
            with conn.cursor() as cur:
                _prune(cur, self._retention)
        except Exception:  # noqa: BLE001
            if conn.closed:
                raise
            logger.warning("realtime listener: prune failed", exc_info=True)

    def _deliver(self, conn, ids) -> None:
        with conn.cursor() as cur:
            cur.execute("SELECT id, user_ids, body FROM realtime_events WHERE id = ANY(%s)", (ids,))
            rows = cur.fetchall()
        for _id, user_ids, body in _in_arrival_order(ids, rows):
            try:
                _deliver_local(json.loads(body), json.loads(user_ids))
            except Exception:  # noqa: BLE001 — one bad row never stops the rest
                logger.warning("realtime listener: undeliverable event %s", _id, exc_info=True)
