"""One transaction per service operation, opt-in (PAD-272 pilot, audit M8).

``padel_app/model.py``'s ``create`` / ``save`` / ``delete`` commit on every
call — 188 sites, one row per transaction, so a multi-step operation that
fails part-way leaves the earlier rows behind (player creation was four
commits; a bad level left an orphan user and player). This module is the
smallest change that lets a service opt into a single transaction without
touching the other 187 sites:

    from padel_app.tools.unit_of_work import transactional

    @transactional
    def add_player_service(data): ...

Inside the block the mixin's ``create``/``save``/``delete`` FLUSH instead of
committing (ids exist, constraints fire at once, nothing is durable yet); the
block commits once on the way out and rolls back on any exception, leaving
the session usable. Nested blocks join the outer one. Outside any block the
mixin behaves exactly as before, so nothing else changes.

The depth counter is thread-local, which matches the scoped session's
granularity for both request threads and the scheduler's executor threads.
The decision on where this goes next (every service, then a request-scoped
commit) is the owner's: ``.cortex/atlas/decisions/2026-09-11-request-scoped-
transactions.md``.
"""
import threading
from contextlib import contextmanager
from functools import wraps

from padel_app.sql_db import db

_state = threading.local()


def active() -> bool:
    """Is a unit of work open on this thread?"""
    return getattr(_state, "depth", 0) > 0


@contextmanager
def unit_of_work():
    depth = getattr(_state, "depth", 0)
    if depth:
        _state.depth = depth + 1
        try:
            yield
        finally:
            _state.depth = depth
        return
    _state.depth = 1
    try:
        yield
        db.session.commit()
    except BaseException:
        db.session.rollback()
        raise
    finally:
        _state.depth = 0


def transactional(fn):
    """Run ``fn`` inside a unit of work."""

    @wraps(fn)
    def wrapper(*args, **kwargs):
        with unit_of_work():
            return fn(*args, **kwargs)

    return wrapper


def commit_or_flush() -> None:
    """What the model mixin calls where it used to ``db.session.commit()``."""
    if active():
        db.session.flush()
    else:
        db.session.commit()
