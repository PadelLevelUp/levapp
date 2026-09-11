"""PAD-291 / B-068 — one app context, one session (compass R-007).

A helper that pushes its own ``app.app_context()`` inside an active one must not
disturb the outer context's session. Before the fix ``db.session`` was scoped per
thread, so the inner teardown's ``db.session.remove()`` dropped the OUTER session
from the registry; a ``Query`` already bound to it then ran on a session nobody
would ever close, and Postgres kept a backend idle in a transaction until the
garbage collector released it (the CI hang after test #1399).

The assertion counts pool checkouts against checkins with the collector disabled,
so a connection the collector would have rescued still counts as leaked. It runs
unchanged on both test backends (R-026).
"""
import gc

from sqlalchemy import event


def _pool_balance(engine):
    balance = {"out": 0}

    @event.listens_for(engine, "checkout")
    def _checkout(dbapi_conn, record, proxy):
        balance["out"] += 1

    @event.listens_for(engine, "checkin")
    def _checkin(dbapi_conn, record):
        balance["out"] -= 1

    return balance


def test_nested_app_context_leaves_outer_session_intact(app):
    from padel_app.models.clubs import Club
    from padel_app.sql_db import db

    with app.app_context():
        engine = db.engine
    balance = _pool_balance(engine)

    was_enabled = gc.isenabled()
    gc.disable()
    try:
        with app.app_context():
            query = Club.query  # bound to the OUTER context's session

            # what every _seed_* helper does: its own context, pushed inside ours
            with app.app_context():
                db.session.add(Club(name="Inner", description="", location="X"))
                db.session.commit()

            assert [c.name for c in query.all()] == ["Inner"]
    finally:
        if was_enabled:
            gc.enable()

    assert balance["out"] == 0, (
        f"{balance['out']} connection(s) still checked out after the outer app "
        "context popped: a session outlived its context (B-068)"
    )


def test_each_app_context_gets_its_own_session(app):
    """The inner context must not be handed the outer context's session object."""
    from padel_app.sql_db import db

    with app.app_context():
        outer = db.session()
        with app.app_context():
            inner = db.session()
            assert inner is not outer
        # the outer session is still the registry's answer after the inner pop
        assert db.session() is outer
