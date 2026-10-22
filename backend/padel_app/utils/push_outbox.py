"""The push outbox (PAD-699; messaging.push-notifications rule 10a; architecture review 2026-10-22).

With `PUSH_QUEUE=outbox` a push is a row in `push_outbox` instead of a job in the in-memory queue of
`push_sender`, so a restart loses nothing and two API copies never each run a sender.

- `enqueue(channel, user_id, payload)`: inside an active unit of work the row joins it (a rollback
  sends nothing); outside one it is written at once on its own short transaction, never by
  committing the caller's session (it would commit the caller's half-done work).
- One drainer per process that holds the scheduler leadership (the worker with WORKER_SPLIT on, the
  API otherwise), started and stopped with it:
    1. claim up to BATCH due rows in one short transaction: pending rows whose `due_at` has come,
       and `sending` rows whose 60 s lease ran out, `FOR UPDATE SKIP LOCKED`, marked `sending` with
       this drainer's id;
    2. per row, look the destination up now (tokens, subscription, VAPID) and send through the
       existing senders, which answer sent | retry | skip;
    3. commit that row's outcome at once, on its own short transaction: `sent`, `skipped` (no
       destination, channel disabled or unconfigured, a dead token: no retry, no incident), or a
       retry backed off 5 s × 2^attempts; after MAX_ATTEMPTS, `dead`, with a `push_failed` incident
       whose detail says so (admin.engine-health's existing kind).
  Terminal rows lose their message. The guarantee is AT LEAST ONCE: a row is sent twice only if the
  process dies between the provider's accept and that row's commit.
- Stop: finish the row in flight, put this drainer's other claimed rows back to pending, return. The
  caller then releases the scheduler lock.
- Once a day the drainer deletes sent and skipped rows older than 24 h, and dead ones older than 30
  days.
The drainer thread keeps one database connection for its claims and outcomes: the one exception to
rule 10's "no connection held across a push".
"""
from __future__ import annotations

import json
import logging
import os
import socket
import threading
import time
import uuid
from datetime import timedelta

from flask import current_app, has_app_context
from sqlalchemy import text

from padel_app.utils.dates import utcnow_naive

logger = logging.getLogger(__name__)

SENT, RETRY, SKIP = "sent", "retry", "skip"
BATCH = 50
MAX_ATTEMPTS = 6
BACKOFF_SECONDS = 5
LEASE_SECONDS = 60
POLL_SECONDS = float(os.getenv("PUSH_OUTBOX_POLL_SECONDS", "1") or 1)
WARN_DEPTH = 200
PRUNE_EVERY_SECONDS = 24 * 3600
KEEP_DONE = timedelta(hours=24)
KEEP_DEAD = timedelta(days=30)
#: PAD-294's circuit: this many consecutive sends slower than SLOW_SECONDS pause the drainer.
SLOW_SECONDS = 8.0
CIRCUIT_TRIP = 3
CIRCUIT_SECONDS = 60.0


def enabled() -> bool:
    """`PUSH_QUEUE=outbox` (default `memory`). App config first (tests), then the environment."""
    value = current_app.config.get("PUSH_QUEUE") if has_app_context() else None
    value = value or os.environ.get("PUSH_QUEUE", "memory")
    return str(value).strip().lower() == "outbox"


def enqueue(channel: str, user_id: int, payload: dict) -> bool:
    from padel_app.models.push_outbox import PushOutbox
    from padel_app.sql_db import db
    from padel_app.tools.unit_of_work import active

    now = utcnow_naive()
    values = dict(created_at=now, updated_at=now, due_at=now, channel=channel, user_id=int(user_id),
                  payload=payload, status="pending", attempts=0)
    if active():
        db.session.add(PushOutbox(**values))
        return True
    with db.engine.begin() as conn:
        conn.execute(PushOutbox.__table__.insert().values(**values))
    return True


# --- claim and outcome (each its own short transaction) -----------------------------------------

def _claim(engine, me: str, limit: int = BATCH) -> list[dict]:
    now = utcnow_naive()
    lock = " FOR UPDATE SKIP LOCKED" if engine.dialect.name == "postgresql" else ""
    sql = text(
        "UPDATE push_outbox SET status = 'sending', claimed_by = :me, claimed_at = :now, updated_at = :now "
        "WHERE id IN (SELECT id FROM push_outbox "
        "  WHERE (status = 'pending' AND due_at <= :now) OR (status = 'sending' AND claimed_at < :stale) "
        f"  ORDER BY due_at, id LIMIT :n{lock}) "
        "RETURNING id, channel, user_id, payload, attempts"
    )
    with engine.begin() as conn:
        rows = conn.execute(sql, {"me": me, "now": now, "stale": now - timedelta(seconds=LEASE_SECONDS),
                                  "n": limit}).mappings().all()
    out = []
    for r in sorted(rows, key=lambda r: r["id"]):
        payload = r["payload"]
        if isinstance(payload, str):
            payload = json.loads(payload)
        out.append({**r, "payload": payload or {}})
    return out


def _finish(engine, me: str, row: dict, outcome: str, detail: str | None) -> str:
    """Commit one row's outcome; answers the status it got. Only a row this drainer still holds is
    changed (a lease another drainer took over is left to it)."""
    now = utcnow_naive()
    detail = (detail or None) and str(detail)[:120]
    base = "UPDATE push_outbox SET updated_at = :now, claimed_by = NULL, claimed_at = NULL, "
    where = " WHERE id = :id AND claimed_by = :me AND status = 'sending'"
    params = {"now": now, "id": row["id"], "me": me, "err": detail}
    if outcome == SENT:
        status, sql = "sent", base + "status = 'sent', sent_at = :now, payload = NULL, last_error = NULL" + where
    elif outcome == SKIP:
        status, sql = "skipped", base + "status = 'skipped', payload = NULL, last_error = :err" + where
    else:
        attempts = int(row["attempts"] or 0) + 1
        params["attempts"] = attempts
        if attempts >= MAX_ATTEMPTS:
            status, sql = "dead", base + "status = 'dead', attempts = :attempts, payload = NULL, last_error = :err" + where
        else:
            params["due"] = now + timedelta(seconds=BACKOFF_SECONDS * 2 ** attempts)
            status, sql = "pending", base + "status = 'pending', attempts = :attempts, due_at = :due, last_error = :err" + where
    with engine.begin() as conn:
        changed = conn.execute(text(sql), params).rowcount
    if changed and status == "dead":
        from padel_app.services import delivery_incidents

        # admin.engine-health's existing kind (its console lists three), marked by its detail.
        delivery_incidents.record("push_failed", row["channel"] if row["channel"] == "webpush" else "expo",
                                  user_id=row["user_id"], detail=f"outbox dead after {MAX_ATTEMPTS} attempts: {detail}")
    return status if changed else "lost"


def _release(engine, me: str) -> int:
    """Put this drainer's claimed, unsent rows back to pending (a stop)."""
    with engine.begin() as conn:
        return conn.execute(text(
            "UPDATE push_outbox SET status = 'pending', claimed_by = NULL, claimed_at = NULL, updated_at = :now "
            "WHERE claimed_by = :me AND status = 'sending'"), {"me": me, "now": utcnow_naive()}).rowcount


def prune(engine) -> int:
    now = utcnow_naive()
    with engine.begin() as conn:
        return conn.execute(text(
            "DELETE FROM push_outbox WHERE (status IN ('sent', 'skipped') AND updated_at < :done) "
            "OR (status = 'dead' AND updated_at < :dead)"),
            {"done": now - KEEP_DONE, "dead": now - KEEP_DEAD}).rowcount


def stats(engine) -> dict:
    """`{depth, oldest_due_age}`: rows waiting or in flight, and how long the oldest has been due."""
    now = utcnow_naive()
    with engine.begin() as conn:
        depth, oldest = conn.execute(text(
            "SELECT count(*), min(due_at) FROM push_outbox WHERE status IN ('pending', 'sending')")).one()
    if isinstance(oldest, str):  # SQLite hands DateTime back as text in a raw query
        from datetime import datetime

        oldest = datetime.fromisoformat(oldest)
    age = max(0, int((now - oldest).total_seconds())) if oldest else 0
    return {"depth": int(depth or 0), "oldest_due_age": age}


#: The app of this process's drainer, for the log lines that run outside an app context (the
#: realtime monitor). Only a process that drains reports the outbox.
_drainer_app = None


def stats_fragment() -> str:
    """For the per-minute log lines (worker and realtime.stats_line); '' when the outbox is off or
    this process does not drain it."""
    try:
        if has_app_context():
            if not enabled():
                return ""
            from padel_app.sql_db import db

            s = stats(db.engine)
        elif _drainer_app is not None:
            with _drainer_app.app_context():
                if not enabled():
                    return ""
                from padel_app.sql_db import db

                s = stats(db.engine)
        else:
            return ""
        if s["depth"] > WARN_DEPTH:
            logger.warning("push outbox depth %d over %d (oldest due %ds ago)", s["depth"], WARN_DEPTH,
                           s["oldest_due_age"])
        return f" outbox_depth={s['depth']} oldest_due_age={s['oldest_due_age']}s"
    except Exception as exc:  # noqa: BLE001 — a log line never fails its caller
        return f" outbox_stats_error={type(exc).__name__}"


# --- sending one row ----------------------------------------------------------------------------

def send_row(row: dict) -> tuple[str, str | None]:
    """Look the destination up now and send. Runs inside an app context."""
    payload = row["payload"] or {}
    user_id = row["user_id"]
    if row["channel"] == "expo":
        from padel_app.models import DeviceToken
        from padel_app.utils.expo_push import expo_push_disabled, send_expo_push_outcome

        if expo_push_disabled():
            return SKIP, "expo disabled"
        tokens = [t.token for t in DeviceToken.query.filter_by(user_id=user_id).all()]
        return send_expo_push_outcome(tokens, payload.get("title"), payload.get("body"),
                                      payload.get("data"), badge=payload.get("badge"))
    if row["channel"] == "webpush":
        from padel_app.models import PushSubscription
        from padel_app.utils.push_notifications import _deliver_web_push_outcome

        key, email = os.getenv("VAPID_PRIVATE_KEY"), os.getenv("VAPID_CLAIMS_EMAIL")
        if not key or not email or not os.getenv("VAPID_PUBLIC_KEY"):
            return SKIP, "vapid unconfigured"
        sub = PushSubscription.query.filter_by(user_id=user_id).first()
        if sub is None:
            return SKIP, "no subscription"
        body = json.dumps({"title": payload.get("title"), "body": payload.get("body"),
                           "url": payload.get("url") or "/"})
        return _deliver_web_push_outcome(user_id, sub.id, sub.subscription_json, body, key, {"sub": email})
    return SKIP, f"unknown channel {row['channel']}"


# --- the drainer --------------------------------------------------------------------------------

class Drainer:
    def __init__(self, app, *, poll: float = POLL_SECONDS, send=send_row, clock=time.monotonic):
        global _drainer_app
        self.app = app
        _drainer_app = app
        self.me = f"{socket.gethostname()[:30]}:{os.getpid()}:{uuid.uuid4().hex[:8]}"
        self.poll = poll
        self._send = send
        self._clock = clock
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread = None
        self._last_prune = None
        self._slow_streak = 0
        self._paused_until = 0.0

    @property
    def running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def start(self) -> None:
        """Idempotent: leadership may be acquired again after it was lost."""
        with self._lock:
            if self.running:
                return
            self._stop = threading.Event()
            self._thread = threading.Thread(target=self._run, name="push-outbox", daemon=True)
            self._thread.start()
        logger.info("push outbox drainer started (%s)", self.me)

    def stop(self, timeout: float = 30.0) -> None:
        """Idempotent. Finishes the row in flight, releases this drainer's other claims."""
        with self._lock:
            thread = self._thread
            self._stop.set()
        if thread is not None and thread is not threading.current_thread():
            thread.join(timeout)
        try:
            with self.app.app_context():
                from padel_app.sql_db import db

                released = _release(db.engine, self.me)
            if released:
                logger.info("push outbox drainer stopped; %d claimed row(s) back to pending", released)
        except Exception as exc:  # noqa: BLE001 — their lease runs out anyway (60 s)
            logger.warning("push outbox: could not release claims at stop: %s", type(exc).__name__)

    def drain_once(self, limit: int = BATCH) -> int:
        """One claim and its sends; answers how many rows were claimed."""
        from padel_app.sql_db import db

        with self.app.app_context():
            engine = db.engine
            rows = _claim(engine, self.me, limit)
            for row in rows:
                if self._stop.is_set():
                    break
                started = self._clock()
                try:
                    outcome, detail = self._send(row)
                except Exception as exc:  # noqa: BLE001 — a sender never takes the drainer down
                    outcome, detail = RETRY, type(exc).__name__
                finally:
                    db.session.remove()
                _finish(engine, self.me, row, outcome, detail)
                if self._note_duration(self._clock() - started):
                    break
            _release(engine, self.me)  # anything claimed but not sent (a stop, the circuit)
        return len(rows)

    def _note_duration(self, elapsed: float) -> bool:
        """PAD-294's circuit; True when the drainer should pause."""
        self._slow_streak = self._slow_streak + 1 if elapsed >= SLOW_SECONDS else 0
        if self._slow_streak >= CIRCUIT_TRIP:
            self._slow_streak = 0
            logger.warning("push outbox: %d consecutive sends slower than %.0f s; pausing %.0f s",
                           CIRCUIT_TRIP, SLOW_SECONDS, CIRCUIT_SECONDS)
            self._paused_until = self._clock() + CIRCUIT_SECONDS
            return True
        return False

    def _maybe_prune(self) -> None:
        now = self._clock()
        if self._last_prune is not None and now - self._last_prune < PRUNE_EVERY_SECONDS:
            return
        self._last_prune = now
        try:
            with self.app.app_context():
                from padel_app.sql_db import db

                removed = prune(db.engine)
            if removed:
                logger.info("push outbox: pruned %d finished row(s)", removed)
        except Exception as exc:  # noqa: BLE001
            logger.warning("push outbox prune failed: %s", type(exc).__name__)

    def _run(self) -> None:
        while not self._stop.is_set():
            self._maybe_prune()
            wait = self.poll
            if self._clock() >= self._paused_until:
                try:
                    if self.drain_once():
                        wait = 0  # more may be due right away
                except Exception as exc:  # noqa: BLE001 — the database may be away for a moment
                    logger.warning("push outbox drain failed: %s", type(exc).__name__)
            self._stop.wait(wait)
