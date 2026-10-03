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


def insert_user_on_an_old_schema(username, name=None):
    """A `users` row for a migration-walk test, by raw SQL naming only the columns every old schema has.

    A walk test downgrades to an older revision and seeds rows there. The ORM's `User` names every column
    the CURRENT model has, so the first migration that adds a `users` column (PAD-485's terms_*) broke
    every walk at once (the #517/#525 Postgres lane). Returns an object with `.id`, like the ORM row did.
    """
    from types import SimpleNamespace

    from sqlalchemy import text

    user_id = db.session.execute(
        text("INSERT INTO users (name, username, email, password, status, is_admin, is_superadmin, created_at, updated_at) "
             "VALUES (:n, :u, :e, 'x', 'active', false, false, now(), now()) RETURNING id"),
        {"n": name or username, "u": username, "e": f"{username}@t.test"},
    ).scalar_one()
    return SimpleNamespace(id=user_id)
