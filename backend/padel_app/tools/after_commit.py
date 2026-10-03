"""Run an action only once the current transaction commits (PAD-499, #527 review).

``on_commit(fn)`` queues ``fn`` on the session; it runs right after the transaction's next real
commit and is dropped by a real rollback. A SAVEPOINT's release or rollback does neither. SQLAlchemy cannot emit
SQL inside ``after_commit``, so a caller builds everything it needs (a payload, its recipients)
BEFORE queueing — from the flushed state the commit will make real — and queues only the side
effect (a live event, a push).
"""
from sqlalchemy import event
from sqlalchemy.orm import Session

from padel_app.sql_db import db

_KEY = "levapp_after_commit"


def on_commit(fn) -> None:
    """Run ``fn()`` after the next commit of the current session; a rollback discards it."""
    db.session.info.setdefault(_KEY, []).append(fn)


@event.listens_for(Session, "after_commit")
def _run_queued(session) -> None:
    # A SAVEPOINT release fires after_commit too (SQLAlchemy 1.4; enrol's _get_or_insert uses one):
    # that is not the transaction committing, so the queue waits for the real commit.
    if session.in_nested_transaction():
        return
    actions = session.info.pop(_KEY, [])
    for fn in actions:
        try:
            fn()
        except Exception:  # noqa: BLE001 — a failed live event never undoes a commit
            from flask import current_app, has_app_context
            if has_app_context():
                current_app.logger.exception("after_commit action failed")


@event.listens_for(Session, "after_rollback")
def _drop_queued(session) -> None:
    # Likewise a SAVEPOINT rollback (the IntegrityError race in _get_or_insert) rolls back only the
    # savepoint; the queued work still belongs to the transaction that goes on.
    if session.in_nested_transaction():
        return
    session.info.pop(_KEY, None)
