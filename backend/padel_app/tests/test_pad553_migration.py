"""PAD-553 (classes.create rule 8c, B-346): the repair migration moves only midnight ends, once.

Seeded in BOTH tables: a midnight row (22:00 -> 00:00 of the same day), a typed-backwards row
(18:00 -> 17:00, B-294's, left alone) and a normal row (10:00 -> 11:00). Upgrading twice moves
the midnight rows exactly one day and touches nothing else. Dropping the `00:00` condition, or
making the repair add a day on every run, fails here (#587 review).

The scratch SQLite half runs everywhere (pattern: test_pad531_migration); the Postgres walk runs
on the Postgres lane and returns the shared database to head in its `finally` (R-037).
"""
import importlib.util
import os
import pathlib

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

VERSIONS = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "versions"
MIGRATIONS_DIR = str(VERSIONS.parent)
PARENT = "f831df5ef8d7"
REVISION = "bee8d57daf79"

ROWS = [
    # id, start, end
    (1, "2026-11-05 22:00:00", "2026-11-05 00:00:00"),  # midnight: moves to 2026-11-06 00:00
    (2, "2026-11-05 18:00:00", "2026-11-05 17:00:00"),  # backwards typo: B-294's, untouched
    (3, "2026-11-05 10:00:00", "2026-11-05 11:00:00"),  # normal: untouched
]
EXPECTED = {
    1: "2026-11-06 00:00:00",
    2: "2026-11-05 17:00:00",
    3: "2026-11-05 11:00:00",
}


def _load():
    (path,) = VERSIONS.glob("*pad553_midnight_end_next_day*.py")
    spec = importlib.util.spec_from_file_location("pad553_mig", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert mod.revision == REVISION and mod.down_revision == PARENT
    return mod


def _ends(conn, table):
    rows = conn.exec_driver_sql(f"SELECT id, end_datetime FROM {table} ORDER BY id").fetchall()
    return {r[0]: str(r[1])[:19] for r in rows}


def test_the_repair_moves_only_midnight_ends_and_only_once_sqlite():
    mod = _load()
    conn = sa.create_engine("sqlite://").connect()
    for table in ("lessons", "lesson_instances"):
        conn.exec_driver_sql(f"CREATE TABLE {table} (id INTEGER PRIMARY KEY, start_datetime DATETIME, end_datetime DATETIME)")
        for row in ROWS:
            conn.exec_driver_sql(f"INSERT INTO {table} (id, start_datetime, end_datetime) VALUES (?, ?, ?)", row)
    for _ in range(2):  # idempotent: the second run must change nothing
        with Operations.context(MigrationContext.configure(conn)):
            mod.upgrade()
    for table in ("lessons", "lesson_instances"):
        assert _ends(conn, table) == EXPECTED, table
    with Operations.context(MigrationContext.configure(conn)):
        mod.downgrade()  # documented no-op
    for table in ("lessons", "lesson_instances"):
        assert _ends(conn, table) == EXPECTED, table


@pytest.mark.skipif(
    os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
    reason="walks the real Alembic revision; Postgres backend only",
)
def test_the_repair_walks_on_postgres(app):
    from flask_migrate import downgrade, upgrade
    from sqlalchemy import text

    from padel_app.sql_db import db
    from padel_app.tests.test_notification_reminder_flow import _seed_coach_and_student
    from padel_app.tests.test_pad474_participant_edit_scope import _seed_weekly_series
    from padel_app.tests.test_pad259_enrolment import _materialise

    def release():
        db.session.commit()
        db.session.remove()

    ids = _seed_coach_and_student(app)
    lesson_id, day = _seed_weekly_series(app, ids["coach_id"], [ids["student_id"]])
    instance_id = _materialise(app, lesson_id, day)
    with app.app_context():
        try:
            release()
            downgrade(directory=MIGRATIONS_DIR, revision=PARENT)
            for table, rid in (("lessons", lesson_id), ("lesson_instances", instance_id)):
                db.session.execute(
                    text(f"UPDATE {table} SET start_datetime = DATE '2026-11-05' + TIME '22:00', "
                         f"end_datetime = DATE '2026-11-05' + TIME '00:00' WHERE id = :i"),
                    {"i": rid},
                )
            release()
            upgrade(directory=MIGRATIONS_DIR, revision=REVISION)
            for table, rid in (("lessons", lesson_id), ("lesson_instances", instance_id)):
                end = db.session.execute(text(f"SELECT end_datetime FROM {table} WHERE id = :i"), {"i": rid}).scalar()
                assert str(end)[:19] == "2026-11-06 00:00:00", table
            release()
        finally:
            release()
            upgrade(directory=MIGRATIONS_DIR)
            release()
