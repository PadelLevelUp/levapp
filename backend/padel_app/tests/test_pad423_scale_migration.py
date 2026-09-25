"""PAD-423 migration 149faa7df297 (evaluations.scale rule 3, criterion "The backfill gives every
existing entry its competency's scale"): `evaluation_entries.scale_min/scale_max` (the scale a
score was given on) and `notification_configs.evaluation_scale_max` (the coach's scale, default 5).
Additive, every DDL guarded, the backfill only fills NULLs, so a second run changes nothing; no
`score` is ever touched. Downgrade drops the three columns.

Postgres only, like test_pad402_migration_walk.py: the sqlite backend builds its schema with
`create_all` and never walks a revision. Seeded with raw SQL at the parent revision, where the new
columns do not exist yet. The session is released before every Alembic call, and the `finally`
returns the database to head.
"""
import os

import pytest
from sqlalchemy import text

from padel_app.sql_db import db

pytestmark = pytest.mark.skipif(
    os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
    reason="walks the real Alembic revision; Postgres backend only",
)

PARENT = "e25428020888"  # 149faa7df297's down_revision (PAD-403)
MIGRATIONS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "migrations")


def _release():
    db.session.commit()
    db.session.remove()


def _cols(table):
    return {
        r[0]
        for r in db.session.execute(
            text("SELECT column_name FROM information_schema.columns WHERE table_name = :t"), {"t": table}
        )
    }


def test_the_migration_snapshots_each_entry_scale_and_changes_no_score(app):
    from flask_migrate import downgrade, upgrade

    from padel_app.models import Association_CoachPlayer, Coach, Player, User

    with app.app_context():
        try:
            _release()
            downgrade(directory=MIGRATIONS_DIR, revision=PARENT)
            assert "scale_max" not in _cols("evaluation_entries")
            _release()

            # A coach, a player, one 1–5 catalogue competency, one legacy (1–5) category and an entry
            # on each, written at the parent revision.
            cu = User(name="C", username="p423m_c", email="p423m_c@t.test", password="x", status="active")
            su = User(name="S", username="p423m_s", email="p423m_s@t.test", password="x", status="active")
            db.session.add_all([cu, su])
            db.session.flush()
            coach, player = Coach(user_id=cu.id), Player(user_id=su.id)
            db.session.add_all([coach, player])
            db.session.flush()
            link = Association_CoachPlayer(coach_id=coach.id, player_id=player.id)
            db.session.add(link)
            db.session.flush()
            coach_id, link_id = coach.id, link.id
            _release()

            def category(name, group):
                return db.session.execute(text(
                    "INSERT INTO evaluation_categories (coach_id, name, scale_min, scale_max, competency_group, "
                    "is_active, created_at, updated_at) VALUES (:c, :n, 1, 5, :g, true, now(), now()) RETURNING id"
                ), {"c": coach_id, "n": name, "g": group}).scalar()

            catalogue, legacy = category("Bandeja", "technique"), category("Resistência", None)
            for cat, score in ((catalogue, 4), (legacy, 3)):
                db.session.execute(text(
                    "INSERT INTO evaluation_entries (coach_player_id, category_id, score, evaluated_at, "
                    "created_at, updated_at) VALUES (:l, :c, :s, now(), now(), now())"
                ), {"l": link_id, "c": cat, "s": score})
            _release()
            scores_before = [r[0] for r in db.session.execute(text("SELECT score FROM evaluation_entries ORDER BY id"))]
            _release()

            upgrade(directory=MIGRATIONS_DIR)
            assert {"scale_min", "scale_max"} <= _cols("evaluation_entries")
            assert "evaluation_scale_max" in _cols("notification_configs")
            rows = db.session.execute(text(
                "SELECT e.scale_min, e.scale_max, c.scale_min, c.scale_max FROM evaluation_entries e "
                "JOIN evaluation_categories c ON c.id = e.category_id"
            )).all()
            assert rows and all((r[0], r[1]) == (r[2], r[3]) == (1, 5) for r in rows)
            _release()

            # A second run is a no-op: guarded DDL, and the backfill only fills NULLs.
            upgrade(directory=MIGRATIONS_DIR)
            scores_after = [r[0] for r in db.session.execute(text("SELECT score FROM evaluation_entries ORDER BY id"))]
            assert scores_after == scores_before
            default = db.session.execute(text(
                "SELECT column_default FROM information_schema.columns "
                "WHERE table_name = 'notification_configs' AND column_name = 'evaluation_scale_max'"
            )).scalar()
            assert default is not None and "5" in str(default)
            _release()

            # Down and up again.
            downgrade(directory=MIGRATIONS_DIR, revision=PARENT)
            assert "scale_max" not in _cols("evaluation_entries")
            assert "evaluation_scale_max" not in _cols("notification_configs")
            _release()
        finally:
            _release()
            upgrade(directory=MIGRATIONS_DIR)
            db.session.execute(text("DELETE FROM coaches WHERE id IN (SELECT c.id FROM coaches c JOIN users u ON u.id = c.user_id WHERE u.username LIKE 'p423m_%')"))
            db.session.execute(text("DELETE FROM players WHERE id IN (SELECT p.id FROM players p JOIN users u ON u.id = p.user_id WHERE u.username LIKE 'p423m_%')"))
            db.session.execute(text("DELETE FROM users WHERE username LIKE 'p423m_%'"))
            _release()
