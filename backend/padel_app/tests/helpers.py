"""
Shared test helper utilities.
"""
import sys

from padel_app.sql_db import db
from padel_app.utils import dates as _dates

# Captured when the helpers are imported, at collection, before any test can pin the clock.
_GENUINE_UTCNOW = _dates.utcnow_naive


def make_coach(app) -> int:
    """
    Create a minimal User + Coach in the test DB and return the coach_id.
    Idempotent within a single app context.
    """
    from padel_app.models import User
    from padel_app.models.coaches import Coach

    with app.app_context():
        user = User(
            name="Test Coach Helper",
            username="test_coach_helper",
            password="testpass123",
        )
        db.session.add(user)
        db.session.flush()

        coach = Coach(user_id=user.id)
        db.session.add(coach)
        db.session.commit()
        return coach.id


def _clock_holders():
    for name, module in list(sys.modules.items()):
        if name.startswith("padel_app") and module is not None and callable(getattr(module, "utcnow_naive", None)):
            yield module


def pin_clock(monkeypatch, now):
    """PAD-253: make every ``utcnow_naive()`` in the app return ``now``.

    Modules bind it by name (``from padel_app.utils.dates import utcnow_naive``),
    so patching the source module alone misses them. This rebinds the name in
    every loaded ``padel_app`` module that holds one, including
    ``padel_app.utils.dates`` itself, so a module imported later gets the fake
    too. Use it for code paths that take no injected ``now`` (HTTP routes above
    all). Returns ``now`` so a test can write ``now = pin_clock(monkeypatch, ...)``.

    Every holder is rebound, not only those holding the genuine function: a module first
    imported under an earlier pin kept that test's fake (#523), and skipping it left a
    stale "now" in the code under test. ``heal_clock_bindings`` (autouse, conftest)
    gives such modules the genuine clock back after each test.
    """

    def fake():
        return now

    for module in _clock_holders():
        monkeypatch.setattr(module, "utcnow_naive", fake)
    return now


def heal_clock_bindings():
    """Give every ``padel_app`` module that still holds a fake ``utcnow_naive`` the genuine one.

    Run after monkeypatch has undone a test's patches: what remains fake was bound by a
    module imported for the first time while the clock was pinned (#523)."""
    for module in _clock_holders():
        if module.utcnow_naive is not _GENUINE_UTCNOW:
            module.utcnow_naive = _GENUINE_UTCNOW
