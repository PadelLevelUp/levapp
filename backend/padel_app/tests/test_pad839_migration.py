"""PAD-839 migration 3696b022341c: the five setup-guide user columns and calendar_blocks.schedule_id
(with its index), added only when absent and dropped on downgrade. Scratch SQLite with hand-made
tables, the way test_pad771_migration proves its own."""
import importlib.util
import pathlib

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

USER_COLUMNS = {
    "setup_guide_snoozed_at", "setup_guide_hidden_at", "setup_guide_ready_closed_at",
    "setup_always_available_at", "setup_alerts_confirmed_at",
}


def _load():
    versions = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "versions"
    (path,) = versions.glob("*pad839_student_setup_guide*.py")
    spec = importlib.util.spec_from_file_location("pad839_mig", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _scratch():
    conn = sa.create_engine("sqlite://").connect()
    conn.exec_driver_sql("CREATE TABLE users (id INTEGER PRIMARY KEY)")
    conn.exec_driver_sql("CREATE TABLE calendar_blocks (id INTEGER PRIMARY KEY)")
    return conn


def _run(conn, fn):
    mod = _load()
    ctx = MigrationContext.configure(conn)
    with Operations.context(ctx):
        mod.op = Operations(ctx)
        getattr(mod, fn)()


def _cols(conn, table):
    return {c["name"]: c for c in sa.inspect(conn).get_columns(table)}


def test_upgrade_adds_the_nullable_columns_and_the_index_and_is_idempotent():
    conn = _scratch()
    _run(conn, "upgrade")
    _run(conn, "upgrade")
    users = _cols(conn, "users")
    assert USER_COLUMNS <= set(users)
    assert all(users[c]["nullable"] for c in USER_COLUMNS)
    blocks = _cols(conn, "calendar_blocks")
    assert blocks["schedule_id"]["nullable"]
    indexes = {i["name"] for i in sa.inspect(conn).get_indexes("calendar_blocks")}
    assert "ix_calendar_blocks_schedule_id" in indexes


def test_downgrade_drops_them_and_is_idempotent():
    conn = _scratch()
    _run(conn, "upgrade")
    _run(conn, "downgrade")
    _run(conn, "downgrade")
    assert not USER_COLUMNS & set(_cols(conn, "users"))
    assert "schedule_id" not in _cols(conn, "calendar_blocks")


def test_the_model_declares_what_the_migration_adds():
    from padel_app.models.calendar_blocks import CalendarBlock
    from padel_app.models.users import User

    assert USER_COLUMNS <= set(User.__table__.columns.keys())
    assert "schedule_id" in CalendarBlock.__table__.columns
    assert "ix_calendar_blocks_schedule_id" in {i.name for i in CalendarBlock.__table__.indexes}
