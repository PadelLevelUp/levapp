"""PAD-547 migration e22cb56a3aee (#588 review): idempotent, including the expression index the
inspector cannot reflect. Scratch SQLite with hand-made tables, as test_pad497_migration does."""
import importlib.util
import pathlib

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def _load():
    versions = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "versions"
    (path,) = versions.glob("e22cb56a3aee_*.py")
    spec = importlib.util.spec_from_file_location("pad547_mig", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


DDL = (
    "CREATE TABLE lessons (id INTEGER PRIMARY KEY)",
    "CREATE TABLE standing_waiting_list_entries (id INTEGER PRIMARY KEY, coach_id INTEGER, player_id INTEGER,"
    " credits_total INTEGER, credits_used INTEGER, expires_at DATETIME, is_active BOOLEAN, created_at DATETIME)",
    "CREATE UNIQUE INDEX uq_standing_entries_active_coach_player ON standing_waiting_list_entries"
    " (coach_id, player_id) WHERE is_active",
    "CREATE TABLE waiting_list_entries (id INTEGER PRIMARY KEY, lesson_instance_id INTEGER, player_id INTEGER,"
    " coach_id INTEGER, standing_entry_id INTEGER, is_active BOOLEAN, joined_at DATETIME)",
    "INSERT INTO lessons VALUES (1), (2)",
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


def _index_names(conn):
    return {r[0] for r in conn.exec_driver_sql(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'standing_waiting_list_entries'")}


def _entry(conn, lesson_id):
    conn.exec_driver_sql(
        "INSERT INTO standing_waiting_list_entries (coach_id, player_id, lesson_id, credits_total, credits_used,"
        f" expires_at, is_active) VALUES (1, 1, {'NULL' if lesson_id is None else lesson_id}, 3, 0, '2030-01-01', 1)"
    )


def test_upgrade_twice_changes_nothing_the_second_time():
    conn = _scratch()
    _run(conn, "upgrade")
    _run(conn, "upgrade")  # #588 review: the second run failed with "index ... already exists"
    names = _index_names(conn)
    assert "uq_standing_entries_active_coach_player_scope" in names
    assert "uq_standing_entries_active_coach_player" not in names
    assert "added_by" in {c["name"] for c in sa.inspect(conn).get_columns("waiting_list_entries")}


def test_the_scoped_index_allows_series_apart_and_refuses_the_same_scope():
    from sqlalchemy.exc import IntegrityError

    conn = _scratch()
    _run(conn, "upgrade")
    _entry(conn, None)
    _entry(conn, 1)
    _entry(conn, 2)
    for lesson_id in (None, 1):
        with pytest.raises(IntegrityError):
            _entry(conn, lesson_id)


def test_downgrade_twice_restores_the_old_index_and_keeps_it():
    conn = _scratch()
    _run(conn, "upgrade")
    _run(conn, "downgrade")
    _run(conn, "downgrade")
    names = _index_names(conn)
    assert "uq_standing_entries_active_coach_player" in names
    assert "uq_standing_entries_active_coach_player_scope" not in names
