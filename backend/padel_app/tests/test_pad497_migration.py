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
    conn = _scratch()
    _run(conn, "upgrade")
    conn.exec_driver_sql("UPDATE notification_events SET answer = 'yes' WHERE id = 101")
    before = _answers(conn)
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
