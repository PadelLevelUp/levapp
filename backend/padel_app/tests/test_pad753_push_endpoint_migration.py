"""PAD-753 migrations a753b1c2d3e4 (schema) and b753c2d3e4f5 (backfill): `push_subscriptions.endpoint`
(auth.push-subscription rule 11). Scratch SQLite with the table as it stands before them, the way
test_pad745_migration proves its migration."""
import importlib.util
import logging
import pathlib

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

VERSIONS = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "versions"


def _load(revision):
    (path,) = VERSIONS.glob(f"{revision}_*.py")
    spec = importlib.util.spec_from_file_location(f"pad753_{revision}", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


SCHEMA, FILL = _load("a753b1c2d3e4"), _load("b753c2d3e4f5")


def _run(conn, mod, fn):
    ctx = MigrationContext.configure(conn)
    with Operations.context(ctx):
        mod.op = Operations(ctx)
        getattr(mod, fn)()


def _insert(conn, row_id, user_id, subscription_json, updated_at):
    conn.execute(sa.text("INSERT INTO push_subscriptions (id, user_id, subscription_json, updated_at) "
                         "VALUES (:i, :u, :s, :t)"), {"i": row_id, "u": user_id, "s": subscription_json, "t": updated_at})


def _rows(conn):
    return conn.execute(sa.text("SELECT id, user_id, endpoint FROM push_subscriptions ORDER BY id")).all()


def _unique(conn):
    return {i["name"]: bool(i["unique"]) for i in sa.inspect(conn).get_indexes("push_subscriptions")}


@pytest.fixture
def conn():
    with sa.create_engine("sqlite://").connect() as conn:
        conn.exec_driver_sql(
            "CREATE TABLE push_subscriptions (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, "
            "subscription_json TEXT NOT NULL, created_at DATETIME, updated_at DATETIME)")
        conn.exec_driver_sql("CREATE UNIQUE INDEX ix_push_subscriptions_user_id ON push_subscriptions (user_id)")
        yield conn


@pytest.mark.criterion("AUTH-PUSH-SUBSCRIPTION-14")
def test_the_migration_keeps_every_working_subscription(conn, caplog):
    for n in (1, 2, 3):
        _insert(conn, n, n, f'{{"endpoint": "https://push.example/SECRET-{n}", "keys": {{}}}}', f"2026-11-0{n} 10:00:00")
    _insert(conn, 4, 4, '{"keys": {}}', "2026-11-04 10:00:00")
    _insert(conn, 5, 5, "not json", "2026-11-04 10:00:00")
    _insert(conn, 6, 6, '{"endpoint": "https://push.example/SECRET-shared"}', "2026-11-06 10:00:00")
    _insert(conn, 7, 7, '{"endpoint": "https://push.example/SECRET-shared"}', "2026-11-05 10:00:00")
    _insert(conn, 8, 8, '{"endpoint": "https://push.example/SECRET-shared"}', None)

    with caplog.at_level(logging.INFO, logger="alembic.runtime.migration"):
        for mod in (SCHEMA, FILL):
            _run(conn, mod, "upgrade")
    kept = [(n, n, f"https://push.example/SECRET-{n}") for n in (1, 2, 3)]
    kept.append((6, 6, "https://push.example/SECRET-shared"))
    assert _rows(conn) == kept
    (line,) = [r.getMessage() for r in caplog.records if "PAD-753" in r.getMessage()]
    assert "4 push subscriptions filled, 2 with no endpoint deleted, 2 duplicates deleted" in line
    assert "SECRET" not in caplog.text
    assert _unique(conn) == {"ix_push_subscriptions_user_id": False, "ix_push_subscriptions_endpoint": True}

    # Running the backfill again changes nothing.
    _run(conn, FILL, "upgrade")
    assert _rows(conn) == kept

    # A user may hold two rows, and the previous release's inserts (no endpoint) never collide.
    _insert(conn, 9, 1, '{"endpoint": "https://push.example/9"}', "2026-11-09 10:00:00")
    _insert(conn, 10, 2, '{"endpoint": "https://push.example/10"}', None)
    conn.execute(sa.text("UPDATE push_subscriptions SET endpoint = 'https://push.example/9' WHERE id = 9"))
    with pytest.raises(sa.exc.IntegrityError):
        conn.execute(sa.text("INSERT INTO push_subscriptions (user_id, subscription_json, endpoint) "
                             "VALUES (3, '{}', 'https://push.example/9')"))

    for mod in (FILL, SCHEMA):
        _run(conn, mod, "downgrade")
    assert conn.execute(sa.text("SELECT id, user_id FROM push_subscriptions ORDER BY id")).all() == [
        (2, 2), (3, 3), (6, 6), (9, 1)]
    assert "endpoint" not in {c["name"] for c in sa.inspect(conn).get_columns("push_subscriptions")}
    assert _unique(conn) == {"ix_push_subscriptions_user_id": True}


def test_they_follow_the_presence_note_migration():
    assert (SCHEMA.revision, SCHEMA.down_revision) == ("a753b1c2d3e4", "32e30677a843")
    assert (FILL.revision, FILL.down_revision) == ("b753c2d3e4f5", "a753b1c2d3e4")
