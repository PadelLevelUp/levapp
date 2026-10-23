"""PAD-745 migration 7a294b4a5a9c: push_receipt, created only when absent, dropped on downgrade.
Scratch SQLite with a hand-made users table, the way test_pad497_migration proves its migration."""
import importlib.util
import pathlib

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def _load():
    versions = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "versions"
    (path,) = versions.glob("*pad745_push_receipt*.py")
    spec = importlib.util.spec_from_file_location("pad745_mig", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _scratch():
    conn = sa.create_engine("sqlite://").connect()
    conn.exec_driver_sql("CREATE TABLE users (id INTEGER PRIMARY KEY)")
    return conn


def _run(conn, fn):
    mod = _load()
    ctx = MigrationContext.configure(conn)
    with Operations.context(ctx):
        mod.op = Operations(ctx)
        getattr(mod, fn)()


def _tables(conn):
    return set(sa.inspect(conn).get_table_names())


def test_upgrade_creates_the_table_with_updated_at_and_is_idempotent():
    conn = _scratch()
    _run(conn, "upgrade")
    _run(conn, "upgrade")
    assert "push_receipt" in _tables(conn)
    cols = {c["name"] for c in sa.inspect(conn).get_columns("push_receipt")}
    assert {"created_at", "updated_at", "ticket_id", "token", "user_id", "outbox_id", "sent_at",
            "status", "error_code", "checked_at"} <= cols
    indexes = {i["name"] for i in sa.inspect(conn).get_indexes("push_receipt")}
    assert {"ix_push_receipt_status_sent_at", "ix_push_receipt_sent_at"} <= indexes


def test_downgrade_drops_it_and_is_idempotent():
    conn = _scratch()
    _run(conn, "upgrade")
    _run(conn, "downgrade")
    _run(conn, "downgrade")
    assert "push_receipt" not in _tables(conn)


def test_it_revises_the_finance_migration():
    mod = _load()
    # unconfirmed: re-chains on 459fc0208b0d when #817 lands (coordinator 2026-10-23)
    assert (mod.revision, mod.down_revision) == ("7a294b4a5a9c", "573da995cdbd")
