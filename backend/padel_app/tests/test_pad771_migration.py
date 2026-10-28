"""PAD-771 migration c4e1a7d2f771: notification_config_changes, created only when absent, dropped on
downgrade. Scratch SQLite with a hand-made coaches table, the way test_pad745_migration proves its own."""
import importlib.util
import pathlib

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def _load():
    versions = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "versions"
    (path,) = versions.glob("*pad771_notification_config_changes*.py")
    spec = importlib.util.spec_from_file_location("pad771_mig", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _scratch():
    conn = sa.create_engine("sqlite://").connect()
    conn.exec_driver_sql("CREATE TABLE coaches (id INTEGER PRIMARY KEY)")
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
    assert "notification_config_changes" in _tables(conn)
    cols = {c["name"] for c in sa.inspect(conn).get_columns("notification_config_changes")}
    assert {"created_at", "updated_at", "coach_id", "changed_at", "key", "before", "after"} <= cols
    indexes = {i["name"] for i in sa.inspect(conn).get_indexes("notification_config_changes")}
    assert "ix_notification_config_changes_coach_id_changed_at" in indexes


def test_downgrade_drops_it_and_is_idempotent():
    conn = _scratch()
    _run(conn, "upgrade")
    _run(conn, "downgrade")
    _run(conn, "downgrade")
    assert "notification_config_changes" not in _tables(conn)


def test_it_revises_the_push_receipt_migration():
    mod = _load()
    assert (mod.revision, mod.down_revision) == ("c4e1a7d2f771", "7a294b4a5a9c")
