"""B-216 data repair b3a1c474d07b: a `daysOfWeek` 7 (ISO Sunday, written only by the bug) becomes 0.
Scratch SQLite with a hand-made table, the way test_pad357 proves its migration."""
import importlib.util
import json
import pathlib

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def _load():
    versions = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "versions"
    (path,) = versions.glob("*b216_stray_sunday_7*.py")
    spec = importlib.util.spec_from_file_location("b216_mig", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


ROWS = {
    1: '{"frequency": "weekly", "daysOfWeek": [0, 6, 7]}',  # prod's lesson 57: 7 next to a real 0
    2: '{"frequency": "weekly", "daysOfWeek": [3, 7]}',  # Monday moved onto Sunday
    3: '{"frequency": "weekly", "daysOfWeek": [1, 3]}',  # untouched control
    4: "FREQ=WEEKLY;BYDAY=SU",  # legacy non-JSON rule, untouched
    5: None,
}


def _scratch():
    conn = sa.create_engine("sqlite://").connect()
    conn.exec_driver_sql("CREATE TABLE lessons (id INTEGER PRIMARY KEY, recurrence_rule TEXT)")
    for lesson_id, rule in ROWS.items():
        conn.execute(sa.text("INSERT INTO lessons (id, recurrence_rule) VALUES (:i, :r)"), {"i": lesson_id, "r": rule})
    return conn


def _run(conn, fn):
    mod = _load()
    ctx = MigrationContext.configure(conn)
    with Operations.context(ctx):
        mod.op = Operations(ctx)
        getattr(mod, fn)()


def _rules(conn):
    return dict(conn.execute(sa.text("SELECT id, recurrence_rule FROM lessons ORDER BY id")).all())


def _days(rule):
    return json.loads(rule)["daysOfWeek"]


def test_upgrade_turns_7_into_0_without_a_duplicate_and_leaves_other_rows_alone():
    conn = _scratch()
    _run(conn, "upgrade")
    rules = _rules(conn)
    assert _days(rules[1]) == [0, 6]
    assert _days(rules[2]) == [0, 3]
    assert json.loads(rules[1])["frequency"] == "weekly"
    assert rules[3] == ROWS[3] and rules[4] == ROWS[4] and rules[5] is None


def test_upgrade_twice_is_a_no_op():
    conn = _scratch()
    _run(conn, "upgrade")
    once = _rules(conn)
    _run(conn, "upgrade")
    assert _rules(conn) == once


def test_downgrade_changes_nothing():
    conn = _scratch()
    _run(conn, "upgrade")
    repaired = _rules(conn)
    _run(conn, "downgrade")
    assert _rules(conn) == repaired
