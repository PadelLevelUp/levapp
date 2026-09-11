"""PAD-275 migration (classes.recurrence rules 6-7, classes.edit rule 4): series_id
backfilled to the lesson's own id (historical forks are NOT reconnected, decision
2026-09-11), excluded_dates added empty, max_players_override NULL where the
copied capacity equals the lesson's and the copied value where it differs. Counts
logged, idempotent, downgrades cleanly.

Scratch SQLite with hand-made tables, like test_pad259_migration.py."""
import importlib.util
import logging
import pathlib

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def _load():
    versions = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "versions"
    (path,) = versions.glob("*pad275_series_overrides*.py")
    spec = importlib.util.spec_from_file_location("pad275_mig", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


DDL = (
    "CREATE TABLE lessons (id INTEGER PRIMARY KEY, max_players INTEGER NOT NULL)",
    "CREATE TABLE lesson_instances (id INTEGER PRIMARY KEY, lesson_id INTEGER REFERENCES lessons(id), max_players INTEGER NOT NULL)",
)


def _scratch():
    engine = sa.create_engine("sqlite://")
    conn = engine.connect()
    for ddl in DDL:
        conn.exec_driver_sql(ddl)
    conn.exec_driver_sql("INSERT INTO lessons (id, max_players) VALUES (1, 4), (2, 4)")
    # 10 and 12 copy their lesson's capacity; 11 was edited to 6 on its own.
    conn.exec_driver_sql(
        "INSERT INTO lesson_instances (id, lesson_id, max_players) VALUES (10, 1, 4), (11, 1, 6), (12, 2, 4)"
    )
    return conn


def _upgrade(conn, mod):
    with Operations.context(MigrationContext.configure(conn)):
        mod.upgrade()


def test_backfill_series_and_capacity_override_and_logs_its_counts(caplog):
    mod = _load()
    conn = _scratch()
    caplog.set_level(logging.INFO, logger="alembic.runtime.migration")
    _upgrade(conn, mod)

    assert conn.exec_driver_sql("SELECT id, series_id, excluded_dates FROM lessons ORDER BY id").fetchall() == [
        (1, 1, None), (2, 2, None)
    ]
    assert conn.exec_driver_sql(
        "SELECT id, max_players, max_players_override FROM lesson_instances ORDER BY id"
    ).fetchall() == [(10, 4, None), (11, 6, 6), (12, 4, None)]
    text = caplog.text
    assert "lessons_series_backfilled=2" in text
    assert "lessons_series_missing_after=0" in text
    assert "instances_capacity_overridden=1 (newly=1)" in text
    assert "instances_capacity_inherited=2" in text

    # Idempotent: a second run touches nothing (newly=0) and keeps the rows.
    _upgrade(conn, mod)
    assert "instances_capacity_overridden=1 (newly=0)" in caplog.text
    assert conn.exec_driver_sql("SELECT series_id FROM lessons ORDER BY id").fetchall() == [(1,), (2,)]


def test_upgrade_fails_when_a_lesson_is_left_without_a_series():
    mod = _load()
    conn = _scratch()
    original = mod.SERIES_BACKFILL
    mod.SERIES_BACKFILL = original + " AND id = 1"
    try:
        with pytest.raises(RuntimeError, match="PAD-275 backfill incomplete"):
            _upgrade(conn, mod)
    finally:
        mod.SERIES_BACKFILL = original


def test_downgrade_drops_the_columns_and_keeps_every_row():
    mod = _load()
    conn = _scratch()
    _upgrade(conn, mod)
    with Operations.context(MigrationContext.configure(conn)):
        mod.downgrade()
    lcols = {c["name"] for c in sa.inspect(conn).get_columns("lessons")}
    icols = {c["name"] for c in sa.inspect(conn).get_columns("lesson_instances")}
    assert "series_id" not in lcols and "excluded_dates" not in lcols
    assert "max_players_override" not in icols
    assert conn.exec_driver_sql("SELECT count(*) FROM lessons").scalar() == 2
    assert conn.exec_driver_sql("SELECT count(*) FROM lesson_instances").scalar() == 3
    _upgrade(conn, mod)
    assert conn.exec_driver_sql("SELECT max_players_override FROM lesson_instances WHERE id = 11").scalar() == 6
