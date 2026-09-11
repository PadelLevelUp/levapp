"""PAD-259 migration (classes.instance-enrollment rule 8): the backfill creates a
presence for every junction row without one, skips rows whose player or instance
is gone (B-059), stamps sources, logs its four counts, is idempotent and
downgrades cleanly.

Scratch SQLite with hand-made tables: the junction is created WITHOUT foreign
keys so an orphan row (deleted player) can be seeded — the shape prod can hold
because its create_all-era schema never had every constraint."""
import importlib.util
import logging
import pathlib

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def _load():
    versions = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "versions"
    (path,) = versions.glob("*pad259_presence_is_enrolment*.py")
    spec = importlib.util.spec_from_file_location("pad259_mig", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


DDL = (
    "CREATE TABLE players (id INTEGER PRIMARY KEY)",
    "CREATE TABLE lessons (id INTEGER PRIMARY KEY)",
    "CREATE TABLE lesson_instances (id INTEGER PRIMARY KEY, lesson_id INTEGER REFERENCES lessons(id))",
    "CREATE TABLE player_in_lesson (id INTEGER PRIMARY KEY, player_id INTEGER, lesson_id INTEGER)",
    "CREATE TABLE player_in_lesson_instance (id INTEGER PRIMARY KEY, player_id INTEGER, lesson_instance_id INTEGER)",
    "CREATE TABLE presences (id INTEGER PRIMARY KEY, lesson_instance_id INTEGER REFERENCES lesson_instances(id), "
    "player_id INTEGER REFERENCES players(id), status VARCHAR(10), justification VARCHAR(12), "
    "invited BOOLEAN NOT NULL DEFAULT 0, confirmed BOOLEAN NOT NULL DEFAULT 0, validated BOOLEAN NOT NULL DEFAULT 0, "
    "late_cancellation BOOLEAN NOT NULL DEFAULT 0, created_at DATETIME, updated_at DATETIME)",
)


def _scratch():
    engine = sa.create_engine("sqlite://")

    @sa.event.listens_for(engine, "connect")
    def _fk_on(dbapi_conn, _record):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    conn = engine.connect()
    for ddl in DDL:
        conn.exec_driver_sql(ddl)
    conn.exec_driver_sql("INSERT INTO players (id) VALUES (1), (2), (3)")
    conn.exec_driver_sql("INSERT INTO lessons (id) VALUES (1)")
    conn.exec_driver_sql("INSERT INTO lesson_instances (id, lesson_id) VALUES (10, 1)")
    # Player 1 is on the series roster; player 2 was added to this date only.
    conn.exec_driver_sql("INSERT INTO player_in_lesson (player_id, lesson_id) VALUES (1, 1)")
    # Three junction rows without a presence; player 99 no longer exists.
    conn.exec_driver_sql(
        "INSERT INTO player_in_lesson_instance (player_id, lesson_instance_id) VALUES (1, 10), (2, 10), (99, 10)"
    )
    # A presence with no junction row (kept, stays 'unknown').
    conn.exec_driver_sql(
        "INSERT INTO presences (lesson_instance_id, player_id, status, invited, confirmed) VALUES (10, 3, NULL, 1, 1)"
    )
    return conn


def _rows(conn):
    return [
        tuple(r) for r in conn.exec_driver_sql(
            "SELECT player_id, invited, confirmed, validated, enrolment_source FROM presences ORDER BY player_id"
        ).fetchall()
    ]


def test_backfill_inserts_stamps_skips_orphans_and_logs_its_counts(caplog):
    mod = _load()
    conn = _scratch()
    caplog.set_level(logging.INFO, logger="alembic.runtime.migration")
    with Operations.context(MigrationContext.configure(conn)):
        mod.upgrade()

    assert _rows(conn) == [
        (1, 1, 0, 0, "roster"),   # backfilled from the series roster
        (2, 1, 0, 0, "coach"),    # backfilled, added to this date only
        (3, 1, 1, 0, "unknown"),  # pre-existing, no junction row: kept as is
    ]
    text = caplog.text
    assert "junction_without_presence_before=3" in text
    assert "presences_inserted=2" in text
    assert "junction_without_presence_after=1" in text  # the orphan, skipped
    assert "capacity_changes=1" in text
    assert "orphan junction rows skipped=1" in text

    # Idempotent: a second run inserts nothing and changes nothing.
    before = _rows(conn)
    with Operations.context(MigrationContext.configure(conn)):
        mod.upgrade()
    assert _rows(conn) == before
    assert "presences_inserted=0" in caplog.text

    # A row outside the six values is refused by the check.
    import pytest

    with pytest.raises(sa.exc.IntegrityError):
        conn.exec_driver_sql(
            "INSERT INTO presences (lesson_instance_id, player_id, enrolment_source) VALUES (10, 1, 'guest')"
        )


def test_upgrade_fails_when_a_junction_row_is_left_without_a_presence():
    """A backfill that leaves a real (non-orphan) junction row uncovered must
    not let the upgrade finish: the code after it reads presences as truth."""
    import pytest

    mod = _load()
    conn = _scratch()
    original = mod.BACKFILL_INSERT
    # Sabotage: the backfill covers only the roster player.
    mod.BACKFILL_INSERT = original + " AND j.player_id = 1"
    try:
        with pytest.raises(RuntimeError, match="PAD-259 backfill incomplete"):
            with Operations.context(MigrationContext.configure(conn)):
                mod.upgrade()
    finally:
        mod.BACKFILL_INSERT = original


def test_downgrade_drops_the_column_and_keeps_every_row():
    mod = _load()
    conn = _scratch()
    with Operations.context(MigrationContext.configure(conn)):
        mod.upgrade()
    with Operations.context(MigrationContext.configure(conn)):
        mod.downgrade()
    cols = {c["name"] for c in sa.inspect(conn).get_columns("presences")}
    assert "enrolment_source" not in cols
    assert conn.exec_driver_sql("SELECT count(*) FROM presences").scalar() == 3
    # And back up again.
    with Operations.context(MigrationContext.configure(conn)):
        mod.upgrade()
    assert [r[-1] for r in _rows(conn)] == ["roster", "coach", "unknown"]
