"""
Shared test helper utilities.
"""
import sys

import pytest

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


def insert_coach_player_on_an_old_schema(coach_id, player_id):
    """A `coach_in_player` row for a migration-walk test, by raw SQL naming only the columns every old
    schema has — the same trap as `insert_user_on_an_old_schema`: PAD-660 added `nickname` and
    `nickname_as_name` to the model, so an ORM insert below that revision names columns that do not
    exist yet (the #738 Postgres lane). Returns an object with `.id`, like the ORM row did.
    """
    from types import SimpleNamespace

    from sqlalchemy import text

    link_id = db.session.execute(
        text("INSERT INTO coach_in_player (coach_id, player_id, created_at, updated_at) "
             "VALUES (:c, :p, now(), now()) RETURNING id"),
        {"c": coach_id, "p": player_id},
    ).scalar_one()
    return SimpleNamespace(id=link_id)


#: PAD-654: the items deselected in this session (`-k`, `-m`, or pytest-split's other shard), recorded
#: by conftest's `pytest_deselected`, so a guard that needs the whole collection still sees it from
#: inside one shard. Here, not in conftest: importing conftest by package name loads a second copy
#: with a second key.
DESELECTED = pytest.StashKey[list]()
