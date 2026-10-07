"""PAD-523 migration bb9ed5a6b56f: notification_configs.no_same_day_class_enabled. The compass rule
"a new marker's default must be off" as a guard: a coach's row that exists before the migration
reads the restriction OFF after it. Tests build their schema from the model, so only running the
migration itself over a pre-existing row can see the server default it writes. Scratch SQLite with
a hand-made table, the way test_pad497_migration proves its migration."""
import importlib.util
import pathlib

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def _load():
    versions = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "versions"
    (path,) = versions.glob("*pad523_no_same_day_class*.py")
    spec = importlib.util.spec_from_file_location("pad523_mig", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _scratch():
    conn = sa.create_engine("sqlite://").connect()
    conn.exec_driver_sql("CREATE TABLE notification_configs (id INTEGER PRIMARY KEY, coach_id INTEGER)")
    conn.exec_driver_sql("INSERT INTO notification_configs VALUES (1, 7), (2, 8)")
    return conn


def _run(conn, fn):
    mod = _load()
    ctx = MigrationContext.configure(conn)
    with Operations.context(ctx):
        mod.op = Operations(ctx)
        getattr(mod, fn)()


def test_an_existing_coach_reads_the_restriction_off():
    conn = _scratch()
    _run(conn, "upgrade")
    rows = conn.exec_driver_sql(
        "SELECT id, no_same_day_class_enabled FROM notification_configs ORDER BY id").fetchall()
    assert [(i, bool(v)) for i, v in rows] == [(1, False), (2, False)]


def test_a_second_upgrade_changes_nothing_and_downgrade_removes_the_column():
    conn = _scratch()
    _run(conn, "upgrade")
    conn.exec_driver_sql("UPDATE notification_configs SET no_same_day_class_enabled = 1 WHERE id = 1")
    _run(conn, "upgrade")
    assert conn.exec_driver_sql(
        "SELECT no_same_day_class_enabled FROM notification_configs WHERE id = 1").scalar() == 1
    _run(conn, "downgrade")
    assert "no_same_day_class_enabled" not in {
        c["name"] for c in sa.inspect(conn).get_columns("notification_configs")}
