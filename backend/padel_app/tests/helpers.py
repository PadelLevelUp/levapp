"""
Shared test helper utilities.
"""
from padel_app.sql_db import db


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


def pin_clock(monkeypatch, now):
    """PAD-253: make every ``utcnow_naive()`` in the app return ``now``.

    Modules bind it by name (``from padel_app.utils.dates import utcnow_naive``),
    so patching the source module alone misses them. This rebinds the name in
    every loaded ``padel_app`` module that holds the real function, including
    ``padel_app.utils.dates`` itself, so a module imported later gets the fake
    too. Use it for code paths that take no injected ``now`` (HTTP routes above
    all). Returns ``now`` so a test can write ``now = pin_clock(monkeypatch, ...)``.
    """
    import sys

    from padel_app.utils import dates

    real = dates.utcnow_naive

    def fake():
        return now

    for name, module in list(sys.modules.items()):
        if name.startswith("padel_app") and getattr(module, "utcnow_naive", None) is real:
            monkeypatch.setattr(module, "utcnow_naive", fake)
    return now
