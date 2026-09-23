"""PAD-402 migration 6a6ac64d814b — `evaluation_shares`: additive, both DDL
statements guarded, downgrade drops the index then the table (both guarded).

Postgres only (the sqlite backend builds its schema with `create_all`, so it
never walks a real revision); the pattern is test_pad363_migration_postgres.py.
Seeded with raw SQL, not ORM models — `evaluation_shares` does not exist at the
downgraded revision (21c864b3dd59), and by the time it does again (after
re-upgrading) the point of the test is the migration's own DDL, not the ORM's
idea of the table. The session is released before every Alembic call (a
connection idle in a transaction blocks DDL forever — the 2026-09-10 TRUNCATE
hang, see test_pad363_migration_postgres.py's docstring) and the `finally`
returns the database to head so the tests that follow it are unaffected.
"""
import json
import os

import pytest
from sqlalchemy import text

from padel_app.sql_db import db

pytestmark = pytest.mark.skipif(
    os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
    reason="walks the real Alembic revision; Postgres backend only",
)

PARENT = "21c864b3dd59"  # 6a6ac64d814b's down_revision
MIGRATIONS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "migrations")

INDEX_NAME = "uq_evaluation_shares_record_id"


def _release():
    db.session.commit()
    db.session.remove()


def _one(sql, **params):
    return dict(db.session.execute(text(sql), params).mappings().one())


def _has_table(name):
    return db.session.execute(
        text("SELECT count(*) AS n FROM information_schema.tables WHERE table_name = :t"), {"t": name}
    ).scalar() == 1


def _has_index(name):
    return db.session.execute(
        text("SELECT count(*) AS n FROM pg_indexes WHERE indexname = :n"), {"n": name}
    ).scalar() == 1


def test_the_migration_walks_down_and_up_with_the_unique_index_and_fk_cascade(app):
    from flask_migrate import downgrade, upgrade

    from padel_app.models import Association_CoachPlayer, Coach, Player, User

    with app.app_context():
        try:
            _release()
            downgrade(directory=MIGRATIONS_DIR, revision=PARENT)
            assert not _has_table("evaluation_shares")
            _release()

            upgrade(directory=MIGRATIONS_DIR)
            assert _has_table("evaluation_shares")
            assert _has_index(INDEX_NAME)
            _release()

            # a second run is a no-op (both DDL statements are guarded)
            upgrade(directory=MIGRATIONS_DIR)
            assert _has_table("evaluation_shares")
            assert _has_index(INDEX_NAME)
            assert _one("SELECT count(*) AS n FROM evaluation_shares")["n"] == 0
            _release()

            # seed a coach, a player and one evaluation_records row (unaffected by
            # this migration, so the ORM is fine for these) and one evaluation_shares
            # row with raw SQL
            coach_user = User(name="C", username="p402m_c", email="p402m_c@t.test", password="x", status="active")
            student_user = User(name="S", username="p402m_s", email="p402m_s@t.test", password="x", status="active")
            db.session.add_all([coach_user, student_user])
            db.session.flush()
            coach, player = Coach(user_id=coach_user.id), Player(user_id=student_user.id)
            db.session.add_all([coach, player])
            db.session.flush()
            link = Association_CoachPlayer(coach_id=coach.id, player_id=player.id)
            db.session.add(link)
            db.session.flush()
            link_id = link.id
            _release()

            record_id = db.session.execute(text(
                "INSERT INTO evaluation_records (coach_player_id, evaluated_on, created_at, updated_at) "
                "VALUES (:l, DATE '2026-09-21', now(), now()) RETURNING id"
            ), {"l": link_id}).scalar()
            _release()

            card = json.dumps({"recordId": record_id, "coachName": "C", "evaluatedOn": "2026-09-21",
                               "className": None, "sharedAt": "2026-09-21T14:05:11", "ratings": [],
                               "evolution": [], "evolutionPeriod": "none", "note": None})
            db.session.execute(text(
                "INSERT INTO evaluation_shares (record_id, shared_at, category_ids, evolution, include_note, "
                "card, created_at, updated_at) "
                "VALUES (:r, now(), :cats, 'none', false, :card, now(), now())"
            ), {"r": record_id, "cats": json.dumps([1]), "card": card})
            _release()
            assert _one("SELECT count(*) AS n FROM evaluation_shares WHERE record_id = :r", r=record_id)["n"] == 1

            # the unique index refuses a second share of the same record
            with pytest.raises(Exception, match=INDEX_NAME):
                db.session.execute(text(
                    "INSERT INTO evaluation_shares (record_id, shared_at, category_ids, evolution, include_note, "
                    "card, created_at, updated_at) "
                    "VALUES (:r, now(), :cats, 'none', false, :card, now(), now())"
                ), {"r": record_id, "cats": json.dumps([1]), "card": card})
            db.session.rollback()
            _release()

            # the FK cascade deletes the share with the record
            db.session.execute(text("DELETE FROM evaluation_records WHERE id = :r"), {"r": record_id})
            _release()
            assert _one("SELECT count(*) AS n FROM evaluation_shares WHERE record_id = :r", r=record_id)["n"] == 0
            _release()

            # downgrade removes the table and index, then a fresh upgrade recreates them
            downgrade(directory=MIGRATIONS_DIR, revision=PARENT)
            assert not _has_table("evaluation_shares")
            _release()
            upgrade(directory=MIGRATIONS_DIR)
            assert _has_table("evaluation_shares")
            assert _has_index(INDEX_NAME)
            _release()
        finally:
            # leave the database at head for the tests that follow
            db.session.rollback()
            _release()
            upgrade(directory=MIGRATIONS_DIR)
            _release()
