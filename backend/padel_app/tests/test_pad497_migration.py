"""PAD-497 migration 0d2107f3fa7b: notification_events.answer, guarded, with a backfill that touches
only "no" answers for classes that have not started, and only once. Scratch SQLite with hand-made
tables, the way test_pad357_migration proves its migration."""
import importlib.util
import pathlib

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def _load():
    versions = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "versions"
    (path,) = versions.glob("*pad497_notification_answer*.py")
    spec = importlib.util.spec_from_file_location("pad497_mig", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


DDL = (
    "CREATE TABLE lesson_instances (id INTEGER PRIMARY KEY, start_datetime DATETIME)",
    "CREATE TABLE messages (id INTEGER PRIMARY KEY, msg_metadata JSON)",
    "CREATE TABLE notification_events (id INTEGER PRIMARY KEY, lesson_instance_id INTEGER,"
    " message_id INTEGER, status VARCHAR(16))",
    "INSERT INTO lesson_instances VALUES (1, datetime('now', '+2 days')), (2, datetime('now', '-2 days'))",
    """INSERT INTO messages VALUES (10, '{"responded": true, "response": "no"}'),
                                   (11, '{"responded": true, "response": "yes"}'),
                                   (12, '{"responded": true, "response": "no"}'),
                                   (13, '{"responded": false}')""",
    # future "no", future "yes", past "no", future unanswered, future with no message
    "INSERT INTO notification_events VALUES (100, 1, 10, 'expired'), (101, 1, 11, 'confirmed'),"
    " (102, 2, 12, 'expired'), (103, 1, 13, 'sent'), (104, 1, NULL, 'sent')",
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


def _answers(conn):
    return dict(conn.exec_driver_sql("SELECT id, answer FROM notification_events ORDER BY id").fetchall())


def test_upgrade_adds_the_column_and_backfills_only_future_noes():
    conn = _scratch()
    _run(conn, "upgrade")
    assert _answers(conn) == {100: "no", 101: None, 102: None, 103: None, 104: None}


def test_a_second_upgrade_changes_nothing():
    """The row that matters (#513 review F6): its message says "no" but the answer was since
    recorded "yes" — a coach's yes writes the answer, never the message. A second run must leave it."""
    conn = _scratch()
    _run(conn, "upgrade")
    conn.exec_driver_sql("UPDATE notification_events SET answer = 'yes' WHERE id = 100")
    before = _answers(conn)
    assert before[100] == "yes"
    _run(conn, "upgrade")
    assert _answers(conn) == before


def test_a_hand_applied_column_is_left_alone_and_downgrade_removes_it():
    conn = _scratch()
    conn.exec_driver_sql("ALTER TABLE notification_events ADD COLUMN answer VARCHAR(8)")
    _run(conn, "upgrade")
    assert _answers(conn)[100] == "no"
    _run(conn, "downgrade")
    assert "answer" not in {c["name"] for c in sa.inspect(conn).get_columns("notification_events")}
    _run(conn, "downgrade")  # guarded both ways


import os

import pytest


@pytest.mark.skipif(os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
                    reason="the Postgres dialect of the backfill (->> on json, now() at UTC)")
def test_on_postgres_the_backfill_touches_only_future_noes_and_runs_once(app):
    """#513 review F6: the same three cases on Postgres, in a scratch schema of the test database."""
    from padel_app.sql_db import db

    with app.app_context():
        conn = db.engine.connect()
        try:
            conn.exec_driver_sql("DROP SCHEMA IF EXISTS pad497_mig CASCADE")
            conn.exec_driver_sql("CREATE SCHEMA pad497_mig")
            conn.exec_driver_sql("SET search_path TO pad497_mig")
            for ddl in (
                "CREATE TABLE lesson_instances (id INTEGER PRIMARY KEY, start_datetime TIMESTAMP)",
                "CREATE TABLE messages (id INTEGER PRIMARY KEY, msg_metadata JSON)",
                "CREATE TABLE notification_events (id INTEGER PRIMARY KEY, lesson_instance_id INTEGER,"
                " message_id INTEGER, status VARCHAR(16))",
                "INSERT INTO lesson_instances VALUES (1, (now() AT TIME ZONE 'UTC') + interval '2 days'),"
                " (2, (now() AT TIME ZONE 'UTC') - interval '2 days'),"
                # Started 30 minutes ago on the club's clock but still "ahead" in UTC (Lisbon is
                # UTC+0/+1): a past class, which only the club-time comparison sees as past.
                " (3, (now() AT TIME ZONE 'Europe/Lisbon') - interval '30 minutes')",
                """INSERT INTO messages VALUES (10, '{"responded": true, "response": "no"}'),
                                               (11, '{"responded": true, "response": "yes"}'),
                                               (12, '{"responded": true, "response": "no"}'),
                                               (13, '{"responded": false}'),
                                               (15, '{"responded": true, "response": "no"}')""",
                "INSERT INTO notification_events VALUES (100, 1, 10, 'expired'), (101, 1, 11, 'confirmed'),"
                " (102, 2, 12, 'expired'), (103, 1, 13, 'sent'), (104, 1, NULL, 'sent'),"
                " (105, 3, 15, 'expired')",
            ):
                conn.exec_driver_sql(ddl)
            _run(conn, "upgrade")
            # 105 is in the offset hour: past on the club's clock, so not backfilled.
            assert _answers(conn) == {100: "no", 101: None, 102: None, 103: None, 104: None, 105: None}
            conn.exec_driver_sql("UPDATE notification_events SET answer = 'yes' WHERE id = 100")
            _run(conn, "upgrade")
            assert _answers(conn)[100] == "yes"
            _run(conn, "downgrade")
            _run(conn, "downgrade")
        finally:
            conn.exec_driver_sql("RESET search_path")   # the connection goes back to the pool
            conn.exec_driver_sql("DROP SCHEMA IF EXISTS pad497_mig CASCADE")
            conn.close()
