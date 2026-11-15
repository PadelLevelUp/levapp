"""The new engine's runs in the app (swap plan §3.1, §8 step 6; PAD-918).

``run_tick`` is the ``engine_tick`` job (notifications.engine-store rule 7, admin.engine-health rule 12):
every ``ENGINE_RUN_EVERY`` it adopts any switched coach's occurrence still without a session row
(``engine_switch.adopt_due``), runs ``Engine.tick`` for every listed session in its own unit and
transaction, and then sends the outbox (``send_outbox``: ``engine_store.dispatch`` with
``engine_outbox.send_effect``). A session that raises is rolled back, skipped and recorded as a
``delivery_incidents`` row of kind ``engine_session_failed`` (channel ``scheduler``); the others go on.
The entry points send the outbox after their own commit too, so an answer's sorry goes out at once.

``engine`` builds the app's ``Engine``: the table-backed store and each session's coach's settings,
read at every call (``engine_store.settings_for``).
"""
from __future__ import annotations

import logging
from datetime import datetime

from padel_app.invitation_engine import Engine
from padel_app.sql_db import db
from padel_app.utils.dates import utcnow_naive

log = logging.getLogger(__name__)

#: admin.engine-health rule 12: the incident a failing session leaves.
SESSION_FAILED = "engine_session_failed"


def engine(now: datetime | None = None, store=None) -> Engine:
    from padel_app.services.engine_store import TableStore, settings_for

    return Engine(store or TableStore(clock=(lambda: now) if now is not None else utcnow_naive), settings_for)


class _OneSession:
    """The store with ``sessions()`` narrowed to one session, so ``Engine.tick`` runs it alone and a
    failure in it stays its own."""

    def __init__(self, store, session: str) -> None:
        self._store, self._session = store, session

    def sessions(self) -> tuple[str, ...]:
        return (self._session,)

    def __getattr__(self, name):
        return getattr(self._store, name)


def tick_sessions(now: datetime, store=None) -> list:
    """``Engine.tick`` for each listed session, one at a time. Returns the effects applied."""
    from padel_app.services import delivery_incidents
    from padel_app.services.engine_store import TableStore, settings_for

    store = store or TableStore(clock=lambda: now)
    effects = []
    for session in store.sessions():
        try:
            effects += Engine(_OneSession(store, session), settings_for).tick(now)
        except Exception as exc:  # noqa: BLE001 — STORE-6: one session never stops the others
            db.session.rollback()
            log.exception("engine_tick: session %s failed; skipped", session)
            delivery_incidents.record(SESSION_FAILED, "scheduler", subject_type="lesson_instance",
                                      subject_id=int(session), error=exc, detail=str(exc))
    return effects


def send_outbox() -> int:
    """Send what the engine's commits left in the outbox (``engine_outbox.send_effect`` per row, each
    claimed first so two callers never send one twice). Returns how many rows were sent. A row's
    ``dispatched_at`` is the send's own clock, read when it is claimed, never the tick's or the effect's
    ``at``: a drain or stuck-row measure reads it."""
    from padel_app.services.engine_outbox import send_effect
    from padel_app.services.engine_store import dispatch

    return dispatch(send_effect)


def run_tick(now: datetime | None = None) -> int:
    """The ``engine_tick`` job: adopt (and materialise), remove a drained coach's old jobs, tick every
    session, send the outbox. Returns how many outbox rows were sent."""
    from padel_app.services.engine_switch import adopt_due, cutover_pass

    now = now or utcnow_naive()
    adopt_due(now=now)
    cutover_pass(now=now)                               # PAD-921 (CONFIG-79): a drained coach's old jobs go
    tick_sessions(now)
    return send_outbox()
