"""PAD-404 — the real Alembic revision walk for 2240837cb663: the evaluation
reminder columns on notification_configs (slot 3, evaluations.reminders rules
1-3, notifications.config rule 13).

Postgres only (the sqlite backend builds its schema with ``create_all``, so it
never exercises the raw ``ALTER TABLE`` a real upgrade/downgrade runs).
Pattern: test_pad363_migration_postgres. A pre-existing ``notification_configs``
row is seeded with raw SQL at the parent revision — below head the ORM model
already carries the new columns, so it cannot be used to write a row that
predates them. The ORM session is released before every Alembic call: a
connection left idle in a transaction blocks the DDL forever (the 2026-09-10
TRUNCATE hang).
"""
import os

import pytest
from sqlalchemy import text

from padel_app.sql_db import db

pytestmark = pytest.mark.skipif(
    os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
    reason="walks the real Alembic revision; Postgres backend only",
)

PARENT = "6a6ac64d814b"
REVISION = "2240837cb663"
MIGRATIONS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "migrations")


def _release():
    db.session.commit()
    db.session.remove()


def _one(sql, **params):
    return dict(db.session.execute(text(sql), params).mappings().one())


def _columns(table):
    rows = db.session.execute(
        text("SELECT column_name FROM information_schema.columns WHERE table_name = :t"), {"t": table}
    )
    return {r[0] for r in rows}


def _column_info(table, name):
    return _one(
        "SELECT data_type, character_maximum_length, is_nullable, column_default "
        "FROM information_schema.columns WHERE table_name = :t AND column_name = :c",
        t=table,
        c=name,
    )


def test_the_migration_walks_up_and_down_with_the_pre_existing_row_intact(app):
    from flask_migrate import downgrade, upgrade

    from padel_app.models import Coach, User

    with app.app_context():
        try:
            _release()
            downgrade(directory=MIGRATIONS_DIR, revision=PARENT)
            assert "evaluation_reminder_type" not in _columns("notification_configs")
            assert "evaluation_reminder_value" not in _columns("notification_configs")

            # A coach at the parent revision — coach_id and auto_notify_enabled
            # are the only NOT NULL columns on notification_configs without a
            # server default (auto_notify_enabled dates to the original
            # create_table, before PAD-279 gave every scalar a DB default).
            coach_user = User(name="C", username="p404m_c", email="p404m_c@t.test", password="x", status="active")
            db.session.add(coach_user)
            db.session.flush()
            coach = Coach(user_id=coach_user.id)
            db.session.add(coach)
            db.session.flush()
            coach_id = coach.id
            existing_config_id = db.session.execute(
                text("INSERT INTO notification_configs (coach_id, auto_notify_enabled) VALUES (:c, false) RETURNING id"),
                {"c": coach_id},
            ).scalar()
            _release()

            # ── upgrade: the two columns appear, the pre-existing row defaults to 'never' ──
            upgrade(directory=MIGRATIONS_DIR, revision=REVISION)

            type_info = _column_info("notification_configs", "evaluation_reminder_type")
            assert type_info["data_type"] == "character varying"
            assert type_info["character_maximum_length"] == 16
            assert type_info["is_nullable"] == "NO"
            assert "never" in type_info["column_default"]

            value_info = _column_info("notification_configs", "evaluation_reminder_value")
            assert value_info["data_type"] == "integer"
            assert value_info["is_nullable"] == "YES"

            existing_row = _one(
                "SELECT evaluation_reminder_type, evaluation_reminder_value FROM notification_configs WHERE id = :i",
                i=existing_config_id,
            )
            assert existing_row["evaluation_reminder_type"] == "never"
            assert existing_row["evaluation_reminder_value"] is None

            # A second coach, inserted AFTER the migration without naming the
            # new evaluation-reminder columns at all: the server default still
            # applies.
            other_user = User(name="C2", username="p404m_c2", email="p404m_c2@t.test", password="x", status="active")
            db.session.add(other_user)
            db.session.flush()
            other_coach = Coach(user_id=other_user.id)
            db.session.add(other_coach)
            db.session.flush()
            other_coach_id = other_coach.id
            new_config_id = db.session.execute(
                text(
                    "INSERT INTO notification_configs (coach_id, auto_notify_enabled) VALUES (:c, false) RETURNING id"
                ),
                {"c": other_coach_id},
            ).scalar()
            _release()
            new_row = _one(
                "SELECT evaluation_reminder_type, evaluation_reminder_value FROM notification_configs WHERE id = :i",
                i=new_config_id,
            )
            assert new_row["evaluation_reminder_type"] == "never"
            assert new_row["evaluation_reminder_value"] is None
            _release()

            # ── downgrade: both columns gone, the original row survives ──
            downgrade(directory=MIGRATIONS_DIR, revision=PARENT)
            assert "evaluation_reminder_type" not in _columns("notification_configs")
            assert "evaluation_reminder_value" not in _columns("notification_configs")
            assert _one(
                "SELECT count(*) AS n FROM notification_configs WHERE id = :i", i=existing_config_id
            )["n"] == 1
            _release()

            # ── upgrade again: idempotent / re-runnable, columns come back ──
            upgrade(directory=MIGRATIONS_DIR, revision=REVISION)
            assert "evaluation_reminder_type" in _columns("notification_configs")
            assert "evaluation_reminder_value" in _columns("notification_configs")
            existing_row_again = _one(
                "SELECT evaluation_reminder_type, evaluation_reminder_value FROM notification_configs WHERE id = :i",
                i=existing_config_id,
            )
            assert existing_row_again["evaluation_reminder_type"] == "never"
            assert existing_row_again["evaluation_reminder_value"] is None
            _release()
        finally:
            # leave the database at head for the tests that follow
            db.session.rollback()
            _release()
            upgrade(directory=MIGRATIONS_DIR)
            _release()
