"""PAD-363 — what only a real database can prove about migration 21c864b3dd59:
the real Alembic revision walks down → up → up → down → up on Postgres with
existing evaluation data intact. "Intact" is the ticket's measure: the row count
and a checksum of (id, score, evaluated_at, category_id, coach_player_id) are
equal before and after, in both directions.

Postgres only (the sqlite backend builds its schema with ``create_all``); the
grouping rules themselves are proven on scratch SQLite in test_pad363_migration.
Pattern: test_pad279_migration_postgres. Evaluation rows are seeded with raw SQL
because, below this revision, the ORM models no longer match the tables. The ORM
session is released before every Alembic call: a connection left idle in a
transaction blocks the DDL forever (the 2026-09-10 TRUNCATE hang).
"""
import os

import pytest
from sqlalchemy import text

from padel_app.sql_db import db

pytestmark = pytest.mark.skipif(
    os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
    reason="walks the real Alembic revision; Postgres backend only",
)

PARENT = "8da963ad8591"
MIGRATIONS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "migrations")

CHECKSUM = (
    "SELECT count(*) AS n, md5(string_agg(id::text || '|' || score::text || '|' || evaluated_at::text || '|' || "
    "category_id::text || '|' || coach_player_id::text, ',' ORDER BY id)) AS digest FROM evaluation_entries"
)

# (score, evaluated_at — naive UTC, category key)
SEED = (
    (5.0, "2026-07-01 10:00:00", "forehand"),
    (7.0, "2026-07-01 15:00:00", "forehand"),          # latest Forehand of 1 July: holds the slot
    (6.5, "2026-07-01 10:00:00.123456", "volley"),
    (8.0, "2026-07-01 23:30:00", "forehand"),          # 00:30 on 2 July on the club's clock
    (2.5, "2026-01-10 23:30:00", "volley"),            # winter: still 10 January
)


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


def test_the_migration_walks_up_and_down_with_every_entry_intact(app):
    from flask_migrate import downgrade, upgrade

    from padel_app.models import Association_CoachPlayer, Coach, Player, User

    with app.app_context():
        try:
            _release()
            downgrade(directory=MIGRATIONS_DIR, revision=PARENT)
            assert "record_id" not in _columns("evaluation_entries")
            assert "competency_group" not in _columns("evaluation_categories")

            coach_user = User(name="C", username="p363m_c", email="p363m_c@t.test", password="x", status="active")
            student_user = User(name="S", username="p363m_s", email="p363m_s@t.test", password="x", status="active")
            db.session.add_all([coach_user, student_user])
            db.session.flush()
            coach, player = Coach(user_id=coach_user.id), Player(user_id=student_user.id)
            db.session.add_all([coach, player])
            db.session.flush()
            link = Association_CoachPlayer(coach_id=coach.id, player_id=player.id)
            db.session.add(link)
            db.session.flush()
            link_id = link.id
            category_ids = {}
            for key, name, low in (("forehand", "Forehand", 1), ("volley", "Volley", 0)):
                category_ids[key] = db.session.execute(
                    text("INSERT INTO evaluation_categories (coach_id, name, scale_min, scale_max, created_at, updated_at) "
                         "VALUES (:c, :n, :lo, 10, now(), now()) RETURNING id"),
                    {"c": coach.id, "n": name, "lo": low},
                ).scalar()
            for score, when, key in SEED:
                db.session.execute(
                    text("INSERT INTO evaluation_entries (coach_player_id, category_id, score, evaluated_at, created_at, updated_at) "
                         "VALUES (:l, :c, :s, CAST(:w AS timestamp), now(), now())"),
                    {"l": link_id, "c": category_ids[key], "s": score, "w": when},
                )
            _release()
            before = _one(CHECKSUM)
            assert before["n"] == len(SEED)
            _release()

            upgrade(directory=MIGRATIONS_DIR)
            assert _one(CHECKSUM) == before  # no row deleted, rescaled, re-dated or re-scored
            records = [
                (r["evaluated_on"].isoformat(), r["lesson_instance_id"], r["note"], r["ratings"])
                for r in db.session.execute(text(
                    "SELECT r.evaluated_on, r.lesson_instance_id, r.note, count(e.id) AS ratings "
                    "FROM evaluation_records r LEFT JOIN evaluation_entries e ON e.record_id = r.id "
                    "WHERE r.coach_player_id = :l GROUP BY r.id ORDER BY r.evaluated_on"), {"l": link_id}).mappings()
            ]
            assert records == [
                ("2026-01-10", None, None, 1),
                ("2026-07-01", None, None, 2),  # the 15:00 Forehand and the Volley; the 10:00 Forehand is history
                ("2026-07-02", None, None, 1),  # 23:30 UTC on 1 July
            ]
            assert _one("SELECT count(*) AS n FROM evaluation_entries WHERE record_id IS NULL")["n"] == 1
            assert _one(
                "SELECT count(*) AS n FROM evaluation_categories WHERE competency_group IS NOT NULL OR NOT is_active"
            )["n"] == 0
            grouping = db.session.execute(text("SELECT id, record_id FROM evaluation_entries ORDER BY id")).fetchall()
            _release()

            # second run: nothing changes
            from alembic.migration import MigrationContext
            from alembic.operations import Operations

            from padel_app.tests.test_pad363_migration import _load

            with db.engine.begin() as conn:
                mod = _load()
                ctx = MigrationContext.configure(conn)
                with Operations.context(ctx):
                    mod.op = Operations(ctx)
                    mod.upgrade()
            assert db.session.execute(text("SELECT id, record_id FROM evaluation_entries ORDER BY id")).fetchall() == grouping
            assert _one("SELECT count(*) AS n FROM evaluation_records")["n"] == 3
            assert _one(CHECKSUM) == before
            _release()

            # the foreign key and the partial unique indexes are real on Postgres
            with pytest.raises(Exception, match="uq_evaluation_records_classless_day"):
                db.session.execute(
                    text("INSERT INTO evaluation_records (coach_player_id, evaluated_on, created_at, updated_at) "
                         "VALUES (:l, DATE '2026-07-01', now(), now())"), {"l": link_id})
            db.session.rollback()
            _release()

            downgrade(directory=MIGRATIONS_DIR, revision=PARENT)
            assert _one(CHECKSUM) == before
            assert "record_id" not in _columns("evaluation_entries")
            assert _one("SELECT count(*) AS n FROM information_schema.tables WHERE table_name = 'evaluation_records'")["n"] == 0
            _release()

            upgrade(directory=MIGRATIONS_DIR)
            assert _one(CHECKSUM) == before
            assert [tuple(r) for r in db.session.execute(
                text("SELECT id, record_id IS NULL FROM evaluation_entries ORDER BY id")).fetchall()] == \
                   [(row[0], row[1] is None) for row in grouping]
            _release()
        finally:
            # leave the database at head for the tests that follow
            db.session.rollback()
            _release()
            upgrade(directory=MIGRATIONS_DIR)
            _release()
