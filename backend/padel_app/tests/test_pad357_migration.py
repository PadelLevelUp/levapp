"""PAD-357 migration 8da963ad8591: four nullable columns, guarded both ways.
Scratch SQLite with hand-made tables, the way test_pad301 proves its migration."""
import importlib.util
import pathlib

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def _load():
    versions = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "versions"
    (path,) = versions.glob("*pad357_availability_requests*.py")
    spec = importlib.util.spec_from_file_location("pad357_mig", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


DDL = (
    "CREATE TABLE coaches (id INTEGER PRIMARY KEY)",
    "CREATE TABLE class_requests (id INTEGER PRIMARY KEY, note TEXT)",
    "CREATE TABLE class_join_requests (id INTEGER PRIMARY KEY)",
)


def _scratch():
    conn = sa.create_engine("sqlite://").connect()
    for ddl in DDL:
        conn.exec_driver_sql(ddl)
    return conn


def _run(conn, fn):
    mod = _load()
    ctx = MigrationContext.configure(conn)
    with Operations.context(ctx):
        mod.op = Operations(ctx)
        getattr(mod, fn)()


def _cols(conn, table):
    return {c["name"] for c in sa.inspect(conn).get_columns(table)}


def test_upgrade_adds_the_four_columns_and_is_a_no_op_twice():
    conn = _scratch()
    _run(conn, "upgrade")
    assert "working_hours" in _cols(conn, "coaches")
    assert {"invitee_player_ids", "recurrence"} <= _cols(conn, "class_requests")
    assert "note" in _cols(conn, "class_join_requests")
    before = {t: _cols(conn, t) for t in ("coaches", "class_requests", "class_join_requests")}
    _run(conn, "upgrade")
    assert {t: _cols(conn, t) for t in before} == before


def test_a_hand_applied_column_is_left_alone():
    conn = _scratch()
    conn.exec_driver_sql("ALTER TABLE coaches ADD COLUMN working_hours JSON")
    _run(conn, "upgrade")
    assert "working_hours" in _cols(conn, "coaches") and "recurrence" in _cols(conn, "class_requests")


def test_downgrade_drops_them_and_is_a_no_op_twice():
    conn = _scratch()
    _run(conn, "upgrade")
    _run(conn, "downgrade")
    assert "working_hours" not in _cols(conn, "coaches")
    assert not ({"invitee_player_ids", "recurrence"} & _cols(conn, "class_requests"))
    assert "note" not in _cols(conn, "class_join_requests")
    _run(conn, "downgrade")
    _run(conn, "upgrade")
    assert "recurrence" in _cols(conn, "class_requests")
