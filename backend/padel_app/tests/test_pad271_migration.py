"""PAD-271 M5 migration (attendance.presence rule 7): the backfill maps the legacy
flags to one `response`, takes `responded_at` from the latest reminder attempt,
stamps `recorded_by`, logs its counts, drops `late_cancellation` after reading
it, is idempotent and downgrades cleanly. Scratch SQLite with hand-made tables
(the enum recreation is Postgres-only and proven by the dry run)."""
import importlib.util
import logging
import pathlib

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def _load():
    versions = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "versions"
    (path,) = versions.glob("*pad271_presence_response*.py")
    spec = importlib.util.spec_from_file_location("pad271_mig", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


DDL = (
    "CREATE TABLE lesson_instances (id INTEGER PRIMARY KEY)",
    "CREATE TABLE players (id INTEGER PRIMARY KEY)",
    "CREATE TABLE presences (id INTEGER PRIMARY KEY, lesson_instance_id INTEGER, player_id INTEGER, "
    "status VARCHAR(10), justification VARCHAR(12), invited BOOLEAN NOT NULL DEFAULT 0, "
    "confirmed BOOLEAN NOT NULL DEFAULT 0, validated BOOLEAN NOT NULL DEFAULT 0, "
    "late_cancellation BOOLEAN NOT NULL DEFAULT 0, enrolment_source VARCHAR(16) NOT NULL DEFAULT 'unknown')",
    "CREATE TABLE reminder_attempts (id INTEGER PRIMARY KEY, lesson_instance_id INTEGER, player_id INTEGER, "
    "responded_at DATETIME, response VARCHAR(20))",
)

#: (player_id, status, justification, validated, confirmed, late) -> expected response
ROWS = (
    (1, "absent", "justified", 0, 1, 0, "declined"),
    (2, "absent", "justified", 0, 1, 1, "cancelled"),
    (3, None, None, 0, 1, 0, "confirmed"),
    (4, "absent", "unjustified", 1, 0, 0, "none"),   # the coach's own mark
    (5, None, None, 0, 0, 0, "none"),
    (6, "present", None, 1, 1, 0, "confirmed"),
)


def _scratch():
    engine = sa.create_engine("sqlite://")
    conn = engine.connect()
    for ddl in DDL:
        conn.exec_driver_sql(ddl)
    conn.exec_driver_sql("INSERT INTO lesson_instances (id) VALUES (10)")
    conn.exec_driver_sql("INSERT INTO players (id) VALUES (1), (2), (3), (4), (5), (6)")
    for pid, status, just, validated, confirmed, late, _ in ROWS:
        conn.exec_driver_sql(
            "INSERT INTO presences (lesson_instance_id, player_id, status, justification, invited, confirmed, "
            "validated, late_cancellation) VALUES (10, ?, ?, ?, 1, ?, ?, ?)",
            (pid, status, just, confirmed, validated, late),
        )
    # Player 1 answered twice; the latest attempt wins. Player 3 never answered a reminder.
    conn.exec_driver_sql(
        "INSERT INTO reminder_attempts (lesson_instance_id, player_id, responded_at, response) VALUES "
        "(10, 1, '2026-09-01 10:00:00', 'no'), (10, 1, '2026-09-02 10:00:00', 'no'), (10, 2, '2026-09-03 09:30:00', 'no')"
    )
    return conn


def _run(mod, conn, fn):
    ctx = MigrationContext.configure(conn)
    with Operations.context(ctx):
        fn()


def _responses(conn):
    return {
        r[0]: (r[1], r[2], r[3]) for r in conn.exec_driver_sql(
            "SELECT player_id, response, responded_at, recorded_by FROM presences ORDER BY player_id"
        ).fetchall()
    }


def _columns(conn):
    return {c["name"] for c in sa.inspect(conn).get_columns("presences")}


def test_backfill_maps_flags_takes_the_latest_attempt_and_logs(caplog):
    mod = _load()
    conn = _scratch()
    caplog.set_level(logging.INFO, logger="alembic.runtime.migration")
    _run(mod, conn, mod.upgrade)

    got = _responses(conn)
    for pid, *_rest, expected in ROWS:
        assert got[pid][0] == expected, (pid, got[pid])
    assert got[1][1] == "2026-09-02 10:00:00", "the latest attempt's responded_at"
    assert got[2][1] == "2026-09-03 09:30:00"
    assert got[3][1] is None, "no attempt, no timestamp"
    assert {pid: got[pid][2] for pid in (1, 2, 3, 6)} == {1: "student", 2: "student", 3: "student", 6: "student"}
    assert got[4][2] is None and got[5][2] is None
    assert "late_cancellation" not in _columns(conn), "derived from now on"
    assert {"response", "responded_at", "recorded_by"} <= _columns(conn)
    line = next(r.message for r in caplog.records if "PAD-271 backfill" in r.message)
    assert "response_none=2" in line and "response_confirmed=2" in line
    assert "response_declined=1" in line and "response_cancelled=1" in line
    assert "rows_with_responded_at=2" in line

    # Idempotent: a second run changes nothing.
    before = _responses(conn)
    _run(mod, conn, mod.upgrade)
    assert _responses(conn) == before


def test_check_refuses_an_unknown_response():
    import pytest

    mod = _load()
    conn = _scratch()
    _run(mod, conn, mod.upgrade)
    with pytest.raises(sa.exc.IntegrityError):
        conn.exec_driver_sql("UPDATE presences SET response = 'maybe' WHERE player_id = 5")


def test_downgrade_restores_late_cancellation_from_the_answer_and_keeps_rows():
    mod = _load()
    conn = _scratch()
    _run(mod, conn, mod.upgrade)
    _run(mod, conn, mod.downgrade)
    cols = _columns(conn)
    assert "late_cancellation" in cols and "response" not in cols and "responded_at" not in cols
    late = {r[0]: r[1] for r in conn.exec_driver_sql("SELECT player_id, late_cancellation FROM presences").fetchall()}
    assert late[2] == 1 and late[1] == 0 and late[3] == 0
    assert conn.exec_driver_sql("SELECT count(*) FROM presences").scalar() == 6
    # And back up again.
    _run(mod, conn, mod.upgrade)
    assert _responses(conn)[2][0] == "cancelled"
