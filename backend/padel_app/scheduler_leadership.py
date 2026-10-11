"""One APScheduler leader across processes (PAD-588, delivery.zero-downtime-deploy rules 1-3).

A rolling deploy runs the old and the new API container side by side for a few seconds. Both share
the Postgres job store (`apscheduler_jobs`), so two running schedulers would fire every due job
twice (R-027 names that constraint). Leadership is a Postgres *session* advisory lock:

- every process starts its scheduler paused and runs `SchedulerLeadership` in a daemon thread;
- the thread takes the lock on a dedicated connection (never a pooled one: a pooled connection
  handed back to the pool with the lock still held would leak leadership to whatever borrows it);
- the holder resumes its scheduler (`on_acquire`: the startup reschedule, then resume);
- the holder pings its connection every `interval`; when the session dies (Postgres restarted,
  the container is stopping) the lock is gone with it, so it pauses (`on_lose`) and retries;
- the waiting process retries `pg_try_advisory_lock` every `interval` and takes over when the old
  container's session ends.

Advisory locks are per database, so production and staging (two databases in one server) each
have their own leader. The reschedule moves off the boot path as a side effect: gunicorn serves
requests while the leadership thread re-arms jobs.
"""
from __future__ import annotations

import logging
import threading
from typing import Callable, Optional, Protocol

# "LEVA" as a 32-bit integer: a fixed key for the scheduler-leader lock (one per database).
SCHEDULER_LOCK_KEY = 0x4C455641
DEFAULT_INTERVAL_SECONDS = 5.0


class LockConnection(Protocol):
    def try_lock(self, key: int) -> bool: ...
    def ping(self) -> None: ...
    def close(self) -> None: ...


class SchedulerLeadership:
    def __init__(
        self,
        connect: Callable[[], LockConnection],
        on_acquire: Callable[[], None],
        on_lose: Callable[[], None],
        *,
        interval: float = DEFAULT_INTERVAL_SECONDS,
        logger: Optional[logging.Logger] = None,
        lock_key: int = SCHEDULER_LOCK_KEY,
    ) -> None:
        self._connect = connect
        self._on_acquire = on_acquire
        self._on_lose = on_lose
        self._interval = interval
        self._log = logger or logging.getLogger(__name__)
        self._key = lock_key
        self._conn: Optional[LockConnection] = None
        self._leader = False
        self._stop = threading.Event()

    @property
    def is_leader(self) -> bool:
        return self._leader

    def _drop_connection(self) -> None:
        if self._conn is not None:
            try:
                self._conn.close()
            except Exception:  # noqa: BLE001 — the session is already gone
                pass
        self._conn = None

    def step(self) -> None:
        """One iteration: ping while leading, otherwise try to take the lock. Never raises."""
        if self._leader:
            try:
                self._conn.ping()  # type: ignore[union-attr]
                return
            except Exception as exc:  # noqa: BLE001
                self._log.warning("Scheduler leadership lost (%s); pausing the scheduler.", exc)
                self._leader = False
                self._drop_connection()
                try:
                    self._on_lose()
                except Exception as cb_exc:  # noqa: BLE001
                    self._log.warning("Pausing the scheduler failed: %s", cb_exc)
                return

        try:
            if self._conn is None:
                self._conn = self._connect()
            acquired = self._conn.try_lock(self._key)
        except Exception as exc:  # noqa: BLE001 — database unreachable: retry next interval
            self._log.info("Scheduler leadership: lock not reachable yet (%s).", exc)
            self._drop_connection()
            return
        if not acquired:
            return

        try:
            self._on_acquire()
        except Exception as exc:  # noqa: BLE001
            # Give the lock back (closing the session releases it) so a later try, here or in the
            # other container, starts from a clean state.
            self._log.warning("Scheduler start after taking leadership failed: %s", exc)
            self._drop_connection()
            return
        self._leader = True
        self._log.info("Scheduler leadership acquired; scheduler running in this process.")

    def run_forever(self) -> None:
        while not self._stop.is_set():
            self.step()
            self._stop.wait(self._interval)

    def start_thread(self) -> threading.Thread:
        thread = threading.Thread(target=self.run_forever, name="scheduler-leadership", daemon=True)
        thread.start()
        return thread

    def stop(self) -> None:
        self._stop.set()
        self._drop_connection()


class PgAdvisoryLockConnection:
    """A dedicated autocommit DBAPI connection that holds the session advisory lock."""

    def __init__(self, raw_connection) -> None:
        # Keep SQLAlchemy's wrapper referenced for the connection's whole life: when the wrapper is
        # garbage-collected NullPool closes the driver connection, and the lock goes with it.
        self._raw = raw_connection
        driver = getattr(raw_connection, "driver_connection", None) or getattr(raw_connection, "dbapi_connection", None)
        try:
            (driver or raw_connection).autocommit = True
        except Exception:  # noqa: BLE001 — not every DBAPI exposes it; statements still run
            pass

    def _scalar(self, sql: str, params=()):
        cur = self._raw.cursor()
        try:
            cur.execute(sql, params)
            row = cur.fetchone()
            return row[0] if row else None
        finally:
            cur.close()

    def try_lock(self, key: int) -> bool:
        return bool(self._scalar("SELECT pg_try_advisory_lock(%s)", (key,)))

    def ping(self) -> None:
        self._scalar("SELECT 1")

    def close(self) -> None:
        self._raw.close()


def pg_lock_connector(database_url: str) -> Callable[[], PgAdvisoryLockConnection]:
    """A connect() for `SchedulerLeadership`: one unpooled connection per call."""
    from sqlalchemy import create_engine
    from sqlalchemy.pool import NullPool

    engine = create_engine(database_url, poolclass=NullPool)

    def connect() -> PgAdvisoryLockConnection:
        return PgAdvisoryLockConnection(engine.raw_connection())

    return connect
