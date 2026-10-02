"""PAD-485 migration: two nullable columns on `users`, guarded both ways (prod schema drift).
Scratch SQLite with a hand-made table, the way test_pad357_migration proves its migration."""
import importlib.util
import pathlib

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def _load():
    versions = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "versions"
    (path,) = versions.glob("*pad485_terms_acceptance*.py")
    spec = importlib.util.spec_from_file_location("pad485_mig", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _scratch():
    conn = sa.create_engine("sqlite://").connect()
    conn.exec_driver_sql("CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT)")
    conn.exec_driver_sql("INSERT INTO users (id, username) VALUES (1, 'ana')")
    return conn


def _run(conn, fn):
    mod = _load()
    ctx = MigrationContext.configure(conn)
    with Operations.context(ctx):
        mod.op = Operations(ctx)
        getattr(mod, fn)()


def _cols(conn):
    return {c["name"] for c in sa.inspect(conn).get_columns("users")}


def test_upgrade_adds_both_columns_null_for_existing_rows_and_is_a_no_op_twice():
    conn = _scratch()
    _run(conn, "upgrade")
    assert {"terms_accepted_at", "terms_version"} <= _cols(conn)
    assert conn.exec_driver_sql("SELECT terms_accepted_at, terms_version FROM users").fetchall() == [(None, None)]
    before = _cols(conn)
    _run(conn, "upgrade")
    assert _cols(conn) == before


def test_a_hand_applied_column_is_left_alone_and_the_downgrade_drops_only_what_is_there():
    conn = _scratch()
    conn.exec_driver_sql("ALTER TABLE users ADD COLUMN terms_version VARCHAR(32)")
    _run(conn, "upgrade")
    assert {"terms_accepted_at", "terms_version"} <= _cols(conn)
    _run(conn, "downgrade")
    assert _cols(conn) == {"id", "username"}
    _run(conn, "downgrade")
    assert _cols(conn) == {"id", "username"}
